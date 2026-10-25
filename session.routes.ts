import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { pool } from '../db.js';
import { AppError } from '../errors.js';

export const sessionRoutes = Router();
sessionRoutes.use(requireUser);
const location = { lat: z.number().min(-90).max(90).optional(), lon: z.number().min(-180).max(180).optional() };

sessionRoutes.post('/', async (req, res, next) => {
  try {
    const body = z.object({ deviceId: z.uuid(), ...location }).parse(req.body);
    const owned = await pool.query("SELECT 1 FROM devices WHERE id=$1 AND owner_id=$2 AND status='ACTIVE'", [body.deviceId, req.auth!.userId]);
    if (!owned.rowCount) throw new AppError(404, 'Active device not found', 'DEVICE_NOT_FOUND');
    const result = await pool.query('INSERT INTO driving_sessions(driver_id,device_id,start_lat,start_lon) VALUES($1,$2,$3,$4) RETURNING *', [req.auth!.userId, body.deviceId, body.lat, body.lon]);
    res.status(201).json({ session: result.rows[0] });
  } catch (error: any) { next(error?.code === '23505' ? new AppError(409, 'Device already has an active session', 'SESSION_ACTIVE') : error); }
});

sessionRoutes.patch('/:id/end', async (req, res, next) => {
  try {
    const body = z.object(location).parse(req.body);
    const result = await pool.query("UPDATE driving_sessions SET status='COMPLETED',ended_at=now(),end_lat=$1,end_lon=$2 WHERE id=$3 AND driver_id=$4 AND status='ACTIVE' RETURNING *", [body.lat, body.lon, req.params.id, req.auth!.userId]);
    if (!result.rowCount) throw new AppError(404, 'Active session not found', 'SESSION_NOT_FOUND');
    res.json({ session: result.rows[0] });
  } catch (error) { next(error); }
});

sessionRoutes.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT s.*, COUNT(e.id)::int AS event_count FROM driving_sessions s LEFT JOIN drowsiness_events e ON e.session_id=s.id WHERE s.driver_id=$1 GROUP BY s.id ORDER BY s.started_at DESC LIMIT 100`, [req.auth!.userId]);
    res.json({ sessions: result.rows });
  } catch (error) { next(error); }
});

sessionRoutes.get('/:id/events', async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT e.*, COALESCE(json_agg(a ORDER BY a.id) FILTER (WHERE a.id IS NOT NULL),'[]') alerts FROM drowsiness_events e JOIN driving_sessions s ON s.id=e.session_id LEFT JOIN alert_deliveries a ON a.event_id=e.id WHERE e.session_id=$1 AND s.driver_id=$2 GROUP BY e.id ORDER BY e.occurred_at DESC`, [req.params.id, req.auth!.userId]);
    res.json({ events: result.rows });
  } catch (error) { next(error); }
});
