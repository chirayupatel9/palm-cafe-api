/**
 * Account lockout: after repeated failed login attempts from the same IP,
 * block further attempts for a configurable duration. Uses Redis when available (multi-instance).
 */
const logger = require('../config/logger');

const MAX_FAILED_ATTEMPTS = parseInt(process.env.LOCKOUT_MAX_ATTEMPTS || '5', 10) || 5;
const LOCKOUT_DURATION_MS = parseInt(process.env.LOCKOUT_DURATION_MS || '900000', 10) || 15 * 60 * 1000;
const LOCKOUT_PREFIX = 'lockout:';

const attempts = new Map();

function getKey(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

async function getRecord(key) {
  const redis = require('../lib/redis');
  const client = redis.getClient();
  if (client) {
    try {
      const raw = await redis.get(LOCKOUT_PREFIX + key);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      logger.warn('Lockout Redis get failed, using memory', { message: e.message });
    }
  }
  return attempts.get(key) || null;
}

async function setRecord(key, record) {
  const redis = require('../lib/redis');
  const client = redis.getClient();
  attempts.set(key, record);
  if (client) {
    try {
      const ttl = record.lockedUntil ? Math.max(1, record.lockedUntil - Date.now()) : 60000;
      await redis.set(LOCKOUT_PREFIX + key, JSON.stringify(record), { px: ttl });
    } catch (e) {
      logger.warn('Lockout Redis set failed', { message: e.message });
    }
  }
}

async function deleteRecord(key) {
  const redis = require('../lib/redis');
  attempts.delete(key);
  if (redis.getClient()) {
    try {
      await redis.del(LOCKOUT_PREFIX + key);
    } catch (e) {
      logger.warn('Lockout Redis del failed', { message: e.message });
    }
  }
}

function cleanup() {
  const now = Date.now();
  for (const [key, data] of attempts.entries()) {
    if (data.lockedUntil && now > data.lockedUntil) {
      attempts.delete(key);
    }
  }
}

const cleanupTimer = setInterval(cleanup, 60000);
if (cleanupTimer.unref) cleanupTimer.unref();

function accountLockout(req, res, next) {
  const key = getKey(req);
  getRecord(key)
    .then((record) => {
      const now = Date.now();
      if (record && record.lockedUntil && now < record.lockedUntil) {
        const retryAfter = Math.ceil((record.lockedUntil - now) / 1000);
        logger.warn('Login attempt while locked out', { ip: key, requestId: req.requestId });
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({
          error: 'Too many failed login attempts. Account temporarily locked.',
          code: 'ACCOUNT_LOCKED',
          retryAfter,
          requestId: req.requestId || undefined
        });
      }
      req._lockoutKey = key;
      req._lockoutRecord = record || { count: 0 };
      next();
    })
    .catch(next);
}

async function recordFailedAttempt(req) {
  const key = req._lockoutKey || getKey(req);
  const record = (await getRecord(key)) || { count: 0 };
  record.count += 1;
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    logger.warn('Account lockout triggered', { ip: key, attempts: record.count });
  }
  await setRecord(key, record);
}

async function clearAttempts(req) {
  const key = req._lockoutKey || getKey(req);
  await deleteRecord(key);
}

module.exports = {
  accountLockout,
  recordFailedAttempt,
  clearAttempts,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS
};
