const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

function baseOptions(overrides) {
  return {
    standardHeaders: true,
    legacyHeaders: false,
    ...overrides
  };
}

function createGeneralLimiter(store) {
  return rateLimit({
    windowMs: 5 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 500 : 10000,
    message: { error: 'Too many requests from this IP, please try again later.', retryAfter: 900 },
    ...baseOptions({
      store: store || undefined,
      handler: (req, res) => {
        logger.warn('Rate limit exceeded', { ip: req.ip });
        res.status(429).json({ error: 'Too many requests from this IP, please try again later.', retryAfter: 900 });
      }
    })
  });
}

function createAuthLimiter(store) {
  return rateLimit({
    windowMs: 5 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 20 : 100,
    message: { error: 'Too many authentication attempts, please try again later.', retryAfter: 900 },
    ...baseOptions({
      store: store || undefined,
      handler: (req, res) => {
        logger.warn('Auth rate limit exceeded', { ip: req.ip });
        res.status(429).json({ error: 'Too many authentication attempts, please try again later.', retryAfter: 900 });
      }
    })
  });
}

function createUploadLimiter(store) {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
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
    max: 200,
    message: { error: 'Too many API requests, please try again later.', retryAfter: 900 },
    ...baseOptions({
      store: store || undefined,
      handler: (req, res) => {
        logger.warn('API rate limit exceeded', { ip: req.ip });
        res.status(429).json({ error: 'Too many API requests, please try again later.', retryAfter: 900 });
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
