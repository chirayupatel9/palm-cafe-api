/**
 * Required environment variable. In production, throws if missing.
 * In development, returns undefined when missing so callers can use a dev default.
 */
function requireEnv(name) {
  const value = process.env[name];
  const missing = value === undefined || value === null || String(value).trim() === '';
  if (process.env.NODE_ENV === 'production' && missing) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const REQUIRED_PRODUCTION_ENV = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET'];

/**
 * Validate required env vars in production. Logs errors and exits process if any missing.
 */
function validateProductionEnv() {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = REQUIRED_PRODUCTION_ENV.filter((name) => {
    const v = process.env[name];
    return v === undefined || v === null || String(v).trim() === '';
  });
  if (missing.length > 0) {
    const logger = require('./logger');
    logger.error('Missing required environment variables in production', { missing });
    process.exit(1);
  }
}

module.exports = { requireEnv, validateProductionEnv };
