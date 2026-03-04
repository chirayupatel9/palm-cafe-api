/**
 * Required environment variable. In production, throws if missing.
 * In development, returns undefined when missing so callers can use a dev default.
 */
export function requireEnv(name: string): string | undefined {
  const value = process.env[name];
  const missing = value === undefined || value === null || String(value).trim() === '';
  if (process.env.NODE_ENV === 'production' && missing) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const ALLOWED_NODE_ENV = ['development', 'test', 'production'];
export const REQUIRED_PRODUCTION_ENV = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET'];
export const JWT_SECRET_MIN_LENGTH = 32;

/**
 * Validate NODE_ENV is one of allowed values. Fail fast if invalid.
 */
export function validateNodeEnv(): string {
  const env = process.env.NODE_ENV || 'development';
  if (!ALLOWED_NODE_ENV.includes(env)) {
    const logger = require('./logger');
    logger.error('Invalid NODE_ENV', { value: env, allowed: ALLOWED_NODE_ENV });
    process.exit(1);
  }
  return env;
}

/**
 * Validate JWT_SECRET length >= 32 in production (security requirement).
 */
export function validateJwtSecretLength(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const secret = process.env.JWT_SECRET;
  if (!secret || String(secret).trim().length < JWT_SECRET_MIN_LENGTH) {
    const logger = require('./logger');
    logger.error(`JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters in production`);
    process.exit(1);
  }
}

/**
 * Validate required env vars in production. Logs errors and exits process if any missing.
 */
export function validateProductionEnv(): void {
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
  validateJwtSecretLength();
}

/**
 * Startup validation: NODE_ENV, then production-only required vars and JWT_SECRET length.
 * Call once at server startup. Fails fast on invalid config.
 */
export function validateStartupEnv(): void {
  validateNodeEnv();
  validateProductionEnv();
}
