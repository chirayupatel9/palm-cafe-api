import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';
import * as metrics from '../lib/metrics';

const DURATION_THRESHOLD_MS = 1000;
const isDebug = (): boolean =>
  (process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'warn')) === 'debug';

export function requestDurationLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  req._startTime = start;
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const statusCode = res.statusCode;
    const requestId = req.requestId || null;
    const method = req.method;
    const route = req.route ? req.route.path : req.path;
    metrics.incrementRequestCount();
    if (statusCode >= 400) metrics.incrementErrorCount();
    const shouldLog = isDebug() || statusCode >= 400 || durationMs > DURATION_THRESHOLD_MS;
    if (!shouldLog) return;
    logger.info('Request completed', { requestId, method, route, statusCode, durationMs });
  });
  next();
}
