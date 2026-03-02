/**
 * Rate limiters. In production, general limit is 3000 req/5min per IP (tuned for customer traffic).
 * Optional env: RATE_LIMIT_GENERAL_MAX, RATE_LIMIT_GENERAL_WINDOW_MS, RATE_LIMIT_AUTH_MAX, RATE_LIMIT_UPLOAD_MAX.
 */
const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

// Optional env overrides for high-traffic deployments (e.g. RATE_LIMIT_GENERAL_MAX=5000).
const GENERAL_WINDOW_MS = Number(process.env.RATE_LIMIT_GENERAL_WINDOW_MS) || 5 * 60 * 1000;
const GENERAL_MAX_PROD = Number(process.env.RATE_LIMIT_GENERAL_MAX) || 3000;
const GENERAL_MAX_DEV = 10000;
const AUTH_MAX_PROD = Number(process.env.RATE_LIMIT_AUTH_MAX) || 50;
const UPLOAD_MAX = Number(process.env.RATE_LIMIT_UPLOAD_MAX) || 30;

function baseOptions(overrides) {
  return {
    standardHeaders: true,
    legacyHeaders: false,
    ...overrides
  };
}

function createGeneralLimiter(store) {
  const max = process.env.NODE_ENV === 'production' ? GENERAL_MAX_PROD : GENERAL_MAX_DEV;
  return rateLimit({
    windowMs: GENERAL_WINDOW_MS,
    max,
    message: { error: 'Too many requests from this IP, please try again later.', retryAfter: 300 },
    ...baseOptions({
      store: store || undefined,
      handler: (req, res) => {
        logger.warn('Rate limit exceeded', { ip: req.ip });
        res.status(429).json({ error: 'Too many requests from this IP, please try again later.', retryAfter: 300 });
      }
    })
  });
}

function createAuthLimiter(store) {
  return rateLimit({
    windowMs: 5 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? AUTH_MAX_PROD : 100,
    message: { error: 'Too many authentication attempts, please try again later.', retryAfter: 300 },
    ...baseOptions({
      store: store || undefined,
      handler: (req, res) => {
        logger.warn('Auth rate limit exceeded', { ip: req.ip });
        res.status(429).json({ error: 'Too many authentication attempts, please try again later.', retryAfter: 300 });
      }
    })
  });
}

function createUploadLimiter(store) {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: UPLOAD_MAX,
    message: { error: 'Too many file uploads, please try again later.', retryAfter: 3600 },
    ...baseOptions({
      store: store || undefined,
      handler: (req, res) => {
        logger.warn('Upload rate limit exceeded', { ip: req.ip });
        res.status(429).json({ error: 'Too many file uploads, please try again later.', retryAfter: 3600 });
      }
    })
  });
}

function createApiLimiter(store) {
  return rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 500,
    message: { error: 'Too many API requests, please try again later.', retryAfter: 300 },
    ...baseOptions({
      store: store || undefined,
      handler: (req, res) => {
        logger.warn('API rate limit exceeded', { ip: req.ip });
        res.status(429).json({ error: 'Too many API requests, please try again later.', retryAfter: 300 });
      }
    })
  });
}

function createLimiters(store) {
  return {
    generalLimiter: createGeneralLimiter(store),
    authLimiter: createAuthLimiter(store),
    uploadLimiter: createUploadLimiter(store),
    apiLimiter: createApiLimiter(store)
  };
}

let limitersPromise = null;
function getLimiters() {
  if (!limitersPromise) {
    const redis = require('../lib/redis');
    limitersPromise = redis.getRateLimitStore().then((store) => createLimiters(store));
  }
  return limitersPromise;
}

function wrap(name) {
  return (req, res, next) => {
    getLimiters()
      .then((l) => l[name](req, res, next))
      .catch(next);
  };
}

module.exports = {
  createLimiters,
  generalLimiter: wrap('generalLimiter'),
  authLimiter: wrap('authLimiter'),
  uploadLimiter: wrap('uploadLimiter'),
  apiLimiter: wrap('apiLimiter')
};
