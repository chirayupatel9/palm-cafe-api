const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

// General API: 500 requests per 5 min per IP (stricter in production)
const generalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 500 : 10000,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { ip: req.ip });
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: 900
    });
  }
});

// Auth routes: 20 attempts per 5 min per IP (stricter in production)
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 100,
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', { ip: req.ip });
    res.status(429).json({
      error: 'Too many authentication attempts, please try again later.',
      retryAfter: 900
    });
  }
});

// Rate limiter for file uploads
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 uploads per hour
  message: {
    error: 'Too many file uploads, please try again later.',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Upload rate limit exceeded', { ip: req.ip });
    res.status(429).json({
      error: 'Too many file uploads, please try again later.',
      retryAfter: 3600
    });
  }
});

// Rate limiter for API endpoints
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  message: {
    error: 'Too many API requests, please try again later.',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('API rate limit exceeded', { ip: req.ip });
    res.status(429).json({
      error: 'Too many API requests, please try again later.',
      retryAfter: 900
    });
  }
});

module.exports = {
  generalLimiter,
  authLimiter,
  uploadLimiter,
  apiLimiter
}; 