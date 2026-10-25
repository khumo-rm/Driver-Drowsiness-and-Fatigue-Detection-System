import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { hashApiKey, requireUser } from '../auth.js';
import { pool } from '../db.js';
import { AppError } from '../errors.js';

export const deviceRoutes = Router();
deviceRoutes.use(requireUser);

deviceRoutes.post('/', async (req, res, next) => {
  try {
    const body = z.object({ serialNumber: z.string().trim().min(6).max(80), name: z.string().trim().min(2).max(80) }).parse(req.body);
    const apiKey = randomBytes(32).toString('base64url');
    const result = await pool.query(
      'INSERT INTO devices(owner_id,serial_number,name,api_key_hash) VALUES($1,$2,$3,$4) RETURNING id,serial_number,name,status,created_at',
      [req.auth!.userId, body.serialNumber, body.name, hashApiKey(apiKey)]
    );
    res.status(201).json({ device: result.rows[0], apiKey });
  } catch (error: any) { next(error?.code === '23505' ? new AppError(409, 'Serial number already paired', 'DEVICE_EXISTS') : error); }
});

deviceRoutes.get('/', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id,serial_number,name,status,firmware_version,battery_percent,last_seen_at,created_at FROM devices WHERE owner_id=$1 ORDER BY created_at DESC', [req.auth!.userId]);
    res.json({ devices: result.rows });
  } catch (error) { next(error); }
});
