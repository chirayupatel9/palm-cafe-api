/**
 * Logs request completion with duration. No body, no PII.
 * In non-debug level: only logs when statusCode >= 400 OR durationMs > thresholdMs.
 * Updates in-memory request/error counts for /api/metrics.
 */
const logger = require('../config/logger');
const metrics = require('../lib/metrics');

const DURATION_THRESHOLD_MS = 1000;
const isDebug = () => (process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'warn')) === 'debug';

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
