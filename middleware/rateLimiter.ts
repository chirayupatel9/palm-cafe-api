import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';
import * as redis from '../lib/redis';

const GENERAL_WINDOW_MS = Number(process.env.RATE_LIMIT_GENERAL_WINDOW_MS) || 5 * 60 * 1000;
const GENERAL_MAX_PROD = Number(process.env.RATE_LIMIT_GENERAL_MAX) || 3000;
const GENERAL_MAX_DEV = 10000;
const AUTH_MAX_PROD = Number(process.env.RATE_LIMIT_AUTH_MAX) || 50;
const UPLOAD_MAX = Number(process.env.RATE_LIMIT_UPLOAD_MAX) || 30;

interface BaseOverrides {
  store?: unknown;
  handler?: (req: Request, res: Response) => void;
}

function baseOptions(overrides: BaseOverrides = {}): Record<string, unknown> {
  return {
    standardHeaders: true,
    legacyHeaders: false,
    ...overrides
  };
}

function createGeneralLimiter(store?: unknown) {
  const max = process.env.NODE_ENV === 'production' ? GENERAL_MAX_PROD : GENERAL_MAX_DEV;
  return rateLimit({
    windowMs: GENERAL_WINDOW_MS,
    max,
    message: { error: 'Too many requests from this IP, please try again later.', retryAfter: 300 },
    ...baseOptions({
      store: store || undefined,
      handler: (req: Request, res: Response) => {
        logger.warn('Rate limit exceeded', { ip: req.ip });
        res.status(429).json({ error: 'Too many requests from this IP, please try again later.', retryAfter: 300 });
      }
    })
  });
}

function createAuthLimiter(store?: unknown) {
  const limiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? AUTH_MAX_PROD : 100,
    message: { error: 'Too many authentication attempts, please try again later.', retryAfter: 300 },
    ...baseOptions({
      store: store || undefined,
      handler: (req: Request, res: Response) => {
        logger.warn('Auth rate limit exceeded', { ip: req.ip });
        res.status(429).json({ error: 'Too many authentication attempts, please try again later.', retryAfter: 300 });
      }
    })
  });
  return limiter;
}

function createUploadLimiter(store?: unknown) {
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: UPLOAD_MAX,
    message: { error: 'Too many file uploads, please try again later.', retryAfter: 3600 },
    ...baseOptions({
      store: store || undefined,
      handler: (req: Request, res: Response) => {
        logger.warn('Upload rate limit exceeded', { ip: req.ip });
        res.status(429).json({ error: 'Too many file uploads, please try again later.', retryAfter: 3600 });
      }
    })
  });
  return limiter;
}

function createApiLimiter(store?: unknown) {
  const limiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 500,
    message: { error: 'Too many API requests, please try again later.', retryAfter: 300 },
    ...baseOptions({
      store: store || undefined,
      handler: (req: Request, res: Response) => {
        logger.warn('API rate limit exceeded', { ip: req.ip });
        res.status(429).json({ error: 'Too many API requests, please try again later.', retryAfter: 300 });
      }
    })
  });
  return limiter;
}

type RateLimitHandler = ReturnType<typeof rateLimit>;
interface Limiters {
  generalLimiter: RateLimitHandler;
  authLimiter: RateLimitHandler;
  uploadLimiter: RateLimitHandler;
  apiLimiter: RateLimitHandler;
}

function createLimiters(store?: unknown): Limiters {
  return {
    generalLimiter: createGeneralLimiter(store),
    authLimiter: createAuthLimiter(store),
    uploadLimiter: createUploadLimiter(store),
    apiLimiter: createApiLimiter(store)
  };
}

let limitersPromise: Promise<Limiters> | null = null;
function getLimiters(): Promise<Limiters> {
  if (!limitersPromise) {
    limitersPromise = redis.getRateLimitStore().then((store) => createLimiters(store));
  }
  return limitersPromise;
}

function wrap(name: keyof Limiters): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    getLimiters()
      .then((l) => l[name](req, res, next))
      .catch(next);
  };
}

export const generalLimiter = wrap('generalLimiter');
export const authLimiter = wrap('authLimiter');
export const uploadLimiter = wrap('uploadLimiter');
export const apiLimiter = wrap('apiLimiter');
export { createLimiters };
