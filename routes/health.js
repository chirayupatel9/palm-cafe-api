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
        logger.info('Health check passed', { ...healthStatus, requestId });
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
        error: error.message,
        database: 'unknown'
      };
      if (requestId) body.requestId = requestId;
      res.status(503).json(body);
    }
  });
};
