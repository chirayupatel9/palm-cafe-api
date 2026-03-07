import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';
import * as redis from '../lib/redis';

const MAX_FAILED_ATTEMPTS = parseInt(process.env.LOCKOUT_MAX_ATTEMPTS || '5', 10) || 5;
const LOCKOUT_DURATION_MS = parseInt(process.env.LOCKOUT_DURATION_MS || '900000', 10) || 15 * 60 * 1000;
const LOCKOUT_PREFIX = 'lockout:';

interface LockoutRecord {
  count: number;
  lockedUntil?: number;
}

const attempts = new Map<string, LockoutRecord>();

function getKey(req: Request): string {
  return req.ip || (req.connection as { remoteAddress?: string } | undefined)?.remoteAddress || 'unknown';
}

async function getRecord(key: string): Promise<LockoutRecord | null> {
  const client = redis.getClient();
  if (client) {
    try {
      const raw = await redis.get(LOCKOUT_PREFIX + key);
      if (raw) return JSON.parse(raw) as LockoutRecord;
    } catch (e) {
      logger.warn('Lockout Redis get failed, using memory', { message: (e as Error).message });
    }
  }
  return attempts.get(key) || null;
}

async function setRecord(key: string, record: LockoutRecord): Promise<void> {
  const client = redis.getClient();
  attempts.set(key, record);
  if (client) {
    try {
      const ttl = record.lockedUntil ? Math.max(1, record.lockedUntil - Date.now()) : 60000;
      await redis.set(LOCKOUT_PREFIX + key, JSON.stringify(record), { px: ttl });
    } catch (e) {
      logger.warn('Lockout Redis set failed', { message: (e as Error).message });
    }
  }
}

async function deleteRecord(key: string): Promise<void> {
  attempts.delete(key);
  if (redis.getClient()) {
    try {
      await redis.del(LOCKOUT_PREFIX + key);
    } catch (e) {
      logger.warn('Lockout Redis del failed', { message: (e as Error).message });
    }
  }
}

function cleanup(): void {
  const now = Date.now();
  for (const [key, data] of attempts.entries()) {
    if (data.lockedUntil && now > data.lockedUntil) {
      attempts.delete(key);
    }
  }
}

const cleanupTimer = setInterval(cleanup, 60000);
if (cleanupTimer.unref) cleanupTimer.unref();

export function accountLockout(req: Request, res: Response, next: NextFunction): void {
  const key = getKey(req);
  getRecord(key)
    .then((record) => {
      const now = Date.now();
      if (record && record.lockedUntil && now < record.lockedUntil) {
        const retryAfter = Math.ceil((record.lockedUntil - now) / 1000);
        logger.warn('Login attempt while locked out', { ip: key, requestId: req.requestId });
        res.set('Retry-After', String(retryAfter));
        res.status(429).json({
          error: 'Too many failed login attempts. Account temporarily locked.',
          code: 'ACCOUNT_LOCKED',
          retryAfter,
          requestId: req.requestId || undefined
        });
        return;
      }
      req._lockoutKey = key;
      req._lockoutRecord = record || { count: 0 };
      next();
    })
    .catch(next);
}

export async function recordFailedAttempt(req: Request): Promise<void> {
  const key = req._lockoutKey || getKey(req);
  const record = (await getRecord(key)) || { count: 0 };
  record.count += 1;
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    logger.warn('Account lockout triggered', { ip: key, attempts: record.count });
  }
  await setRecord(key, record);
}

export async function clearAttempts(req: Request): Promise<void> {
  const key = req._lockoutKey || getKey(req);
  await deleteRecord(key);
}

export { MAX_FAILED_ATTEMPTS, LOCKOUT_DURATION_MS };
