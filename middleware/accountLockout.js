/**
 * Account lockout: after repeated failed login attempts from the same IP,
 * block further attempts for a configurable duration. Does not log passwords or tokens.
 */
const logger = require('../config/logger');

const MAX_FAILED_ATTEMPTS = parseInt(process.env.LOCKOUT_MAX_ATTEMPTS || '5', 10) || 5;
const LOCKOUT_DURATION_MS = parseInt(process.env.LOCKOUT_DURATION_MS || '900000', 10) || 15 * 60 * 1000;

const attempts = new Map();

function getKey(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function cleanup() {
  const now = Date.now();
  for (const [key, data] of attempts.entries()) {
    if (data.lockedUntil && now > data.lockedUntil) {
      attempts.delete(key);
    }
  }
}

setInterval(cleanup, 60000);

function accountLockout(req, res, next) {
  const key = getKey(req);
  const now = Date.now();
  const record = attempts.get(key);

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
}

function recordFailedAttempt(req) {
  const key = req._lockoutKey || getKey(req);
  let record = attempts.get(key) || { count: 0 };
  record.count += 1;
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    logger.warn('Account lockout triggered', { ip: key, attempts: record.count });
  }
  attempts.set(key, record);
}

function clearAttempts(req) {
  const key = req._lockoutKey || getKey(req);
  attempts.delete(key);
}

module.exports = {
  accountLockout,
  recordFailedAttempt,
  clearAttempts,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS
};
