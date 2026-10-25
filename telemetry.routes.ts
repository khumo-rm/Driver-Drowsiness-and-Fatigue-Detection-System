import { Router } from 'express';
import { z } from 'zod';
import { requireDevice } from '../auth.js';
import { classifyDrowsiness } from '../detection.js';
import { pool } from '../db.js';
import { AppError } from '../errors.js';

export const telemetryRoutes = Router();
telemetryRoutes.use(requireDevice);
const sampleSchema = z.object({
  sequenceNumber: z.int().nonnegative(), capturedAt: z.iso.datetime(), eyeAspectRatio: z.number().min(0).max(2).optional(),
  eyeClosedMs: z.int().nonnegative().optional(), blinkRate: z.number().nonnegative().optional(), headPitch: z.number().optional(),
  headRoll: z.number().optional(), confidence: z.number().min(0).max(1), drowsinessScore: z.number().min(0).max(1),
  batteryPercent: z.int().min(0).max(100).optional(), firmwareVersion: z.string().max(40).optional()
});

telemetryRoutes.post('/batch', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const body = z.object({ sessionId: z.uuid(), samples: z.array(sampleSchema).min(1).max(250) }).parse(req.body);
    await client.query('BEGIN');
    const session = await client.query("SELECT id FROM driving_sessions WHERE id=$1 AND device_id=$2 AND status='ACTIVE' FOR UPDATE", [body.sessionId, req.device!.id]);
    if (!session.rowCount) throw new AppError(404, 'Active session not found for device', 'SESSION_NOT_FOUND');
    let accepted = 0, duplicates = 0, events = 0;
    for (const sample of body.samples) {
      const inserted = await client.query(`INSERT INTO telemetry_samples(session_id,device_id,sequence_number,captured_at,eye_aspect_ratio,eye_closed_ms,blink_rate,head_pitch,head_roll,confidence,drowsiness_score)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(device_id,sequence_number) DO NOTHING RETURNING id`,
        [body.sessionId, req.device!.id, sample.sequenceNumber, sample.capturedAt, sample.eyeAspectRatio, sample.eyeClosedMs, sample.blinkRate, sample.headPitch, sample.headRoll, sample.confidence, sample.drowsinessScore]);
      if (!inserted.rowCount) { duplicates++; continue; }
      accepted++;
      const classification = classifyDrowsiness(sample);
      if (classification) {
        const event = await client.query(`INSERT INTO drowsiness_events(session_id,telemetry_id,level,score,reason,occurred_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [body.sessionId, inserted.rows[0].id, classification.level, sample.drowsinessScore, classification.reason, sample.capturedAt]);
        const channels = classification.level === 'CRITICAL' ? ['GLASSES','BUZZER','DASHBOARD','MOBILE'] : ['GLASSES','DASHBOARD'];
        for (const channel of channels) await client.query('INSERT INTO alert_deliveries(event_id,channel) VALUES($1,$2)', [event.rows[0].id, channel]);
        events++;
      }
    }
    const latest = body.samples.at(-1)!;
    await client.query('UPDATE devices SET last_seen_at=now(),battery_percent=COALESCE($1,battery_percent),firmware_version=COALESCE($2,firmware_version) WHERE id=$3', [latest.batteryPercent, latest.firmwareVersion, req.device!.id]);
    await client.query('COMMIT');
    res.status(202).json({ accepted, duplicates, events });
  } catch (error) { await client.query('ROLLBACK'); next(error); }
  finally { client.release(); }
});
