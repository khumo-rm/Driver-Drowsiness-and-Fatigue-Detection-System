import type { NextFunction, Request, Response } from 'express';
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';
import { config } from './config.js';
import { pool } from './db.js';
import { AppError } from './errors.js';

const key = new TextEncoder().encode(config.JWT_SECRET);
const scryptAsync = promisify(scryptCb);
const API_KEY_DERIVED_KEY_LENGTH = 64;

export async function issueToken(userId: string, role: string) {
  return new SignJWT({ role }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId).setIssuer(config.JWT_ISSUER).setIssuedAt().setExpirationTime('2h').sign(key);
}

export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new AppError(401, 'Bearer token required', 'UNAUTHENTICATED');
    const { payload } = await jwtVerify(token, key, { issuer: config.JWT_ISSUER });
    if (!payload.sub || (payload.role !== 'DRIVER' && payload.role !== 'ADMIN')) throw new Error();
    req.auth = { userId: payload.sub, role: payload.role };
    next();
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(401, 'Invalid or expired token', 'UNAUTHENTICATED'));
  }
}

export const hashApiKey = async (value: string) => {
  const salt = randomBytes(16);
  const derived = await scryptAsync(value, salt, API_KEY_DERIVED_KEY_LENGTH) as Buffer;
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
};

const verifyApiKeyHash = async (value: string, storedHash: string) => {
  if (storedHash.startsWith('scrypt$')) {
    const [, saltHex, derivedHex] = storedHash.split('$');
    if (!saltHex || !derivedHex) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(derivedHex, 'hex');
    const supplied = await scryptAsync(value, salt, expected.length) as Buffer;
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }

  const suppliedLegacy = Buffer.from(createHash('sha256').update(value).digest('hex'));
  const storedLegacy = Buffer.from(storedHash);
  return suppliedLegacy.length === storedLegacy.length && timingSafeEqual(suppliedLegacy, storedLegacy);
};

export async function requireDevice(req: Request, _res: Response, next: NextFunction) {
  try {
    const serial = req.header('x-device-serial');
    const apiKey = req.header('x-device-key');
    if (!serial || !apiKey) throw new AppError(401, 'Device credentials required', 'DEVICE_UNAUTHENTICATED');
    const result = await pool.query('SELECT id, owner_id, api_key_hash, status FROM devices WHERE serial_number=$1', [serial]);
    const device = result.rows[0];
    if (!device || device.status !== 'ACTIVE') throw new AppError(401, 'Unknown or inactive device', 'DEVICE_UNAUTHENTICATED');
    const valid = await verifyApiKeyHash(apiKey, device.api_key_hash);
    if (!valid) throw new AppError(401, 'Invalid device key', 'DEVICE_UNAUTHENTICATED');
    req.device = { id: device.id, ownerId: device.owner_id };
    next();
  } catch (error) { next(error); }
}
