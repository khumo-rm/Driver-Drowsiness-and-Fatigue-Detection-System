import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db.js';
import { AppError } from '../errors.js';
import { issueToken } from '../auth.js';

export const authRoutes = Router();
const registerSchema = z.object({ email: z.email(), password: z.string().min(10).max(128), displayName: z.string().trim().min(2).max(80) });

authRoutes.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const hash = await bcrypt.hash(body.password, 12);
    const result = await pool.query(
      'INSERT INTO users(email,password_hash,display_name) VALUES(lower($1),$2,$3) RETURNING id,email,display_name,role',
      [body.email, hash, body.displayName]
    );
    const user = result.rows[0];
    res.status(201).json({ user, token: await issueToken(user.id, user.role) });
  } catch (error: any) {
    next(error?.code === '23505' ? new AppError(409, 'Email already registered', 'EMAIL_EXISTS') : error);
  }
});

authRoutes.post('/login', async (req, res, next) => {
  try {
    const body = z.object({ email: z.email(), password: z.string().min(1) }).parse(req.body);
    const result = await pool.query('SELECT id,email,display_name,role,password_hash FROM users WHERE email=lower($1)', [body.email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(body.password, user.password_hash))) throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    delete user.password_hash;
    res.json({ user, token: await issueToken(user.id, user.role) });
  } catch (error) { next(error); }
});
