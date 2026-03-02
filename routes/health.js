const { testConnection } = require('../config/database');
const logger = require('../config/logger');

module.exports = function registerHealth(app) {
  app.get('/api/health', async (req, res) => {
    const requestId = req.requestId || null;
    try {
      const dbConnected = await testConnection();
      const ok = dbConnected;
      const healthStatus = {
        status: ok ? 'OK' : 'DEGRADED',
        timestamp: new Date().toISOString(),
        database: dbConnected ? 'connected' : 'disconnected',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
      };
      if (requestId) healthStatus.requestId = requestId;

      if (ok) {
        res.json(healthStatus);
      } else {
        logger.warn('Health check: database disconnected', { requestId });
        res.status(503).json(healthStatus);
      }
    } catch (error) {
      logger.error('Health check failed', { error: error.message, requestId });
      const body = {
        status: 'ERROR',
        timestamp: new Date().toISOString(),
        error: 'Internal server error',
        database: 'unknown',
        code: 'HEALTH_CHECK_FAILED',
        requestId: requestId || undefined
      };
      res.status(503).json(body);
    }
  });

  app.get('/api/readiness', async (req, res) => {
    const requestId = req.requestId || null;
    try {
      const dbConnected = await testConnection();
      const body = {
        ready: dbConnected,
        timestamp: new Date().toISOString(),
        database: dbConnected ? 'connected' : 'disconnected',
        code: dbConnected ? undefined : 'NOT_READY',
        requestId: requestId || undefined
      };
      if (dbConnected) {
        res.status(200).json(body);
      } else {
        res.status(503).json(body);
      }
    } catch (error) {
      logger.error('Readiness check failed', { error: error.message, requestId });
      res.status(503).json({
        ready: false,
        timestamp: new Date().toISOString(),
        database: 'unknown',
        code: 'READINESS_CHECK_FAILED',
        requestId: requestId || undefined
      });
    }
  });
};
