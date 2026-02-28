/**
 * Logs request completion with duration. No body, no PII.
 * In non-debug level: only logs when statusCode >= 400 OR durationMs > thresholdMs.
 * Updates in-memory request/error counts for /api/metrics.
 */
const logger = require('../config/logger');
const metrics = require('../lib/metrics');

const DURATION_THRESHOLD_MS = 1000;
const isDebug = () => (process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'warn')) === 'debug';

/**
 * Middleware that records a request start time, updates in-memory request/error metrics, and conditionally logs request completion with duration and routing metadata.
 *
 * This middleware stores the start timestamp on `req._startTime`, increments a global request count (and an error count when `res.statusCode >= 400`), and—when debugging is enabled, the status is an error, or the duration exceeds the configured threshold—emits an info-level log containing `requestId`, `method`, `route`, `statusCode`, and `durationMs`.
 *
 * @param {import('http').IncomingMessage & { _startTime?: number, requestId?: string, method?: string, route?: { path?: string }, path?: string }} req - Express request object; `req._startTime` will be set and `req.requestId`, `req.method`, `req.route`, or `req.path` may be read.
 * @param {import('http').ServerResponse & { statusCode?: number, on: Function }} res - Express response object; the middleware listens for the `'finish'` event and reads `res.statusCode`.
 * @param {Function} next - Express next middleware callback.
 */
function requestDurationLogger(req, res, next) {
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

    logger.info('Request completed', {
      requestId,
      method,
      route,
      statusCode,
      durationMs
    });
  });

  next();
}

module.exports = requestDurationLogger;
