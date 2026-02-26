const { testConnection } = require('../config/database');
const logger = require('../config/logger');

module.exports = function registerHealth(app) {
  app.get('/api/health', async (req, res) => {
    try {
      const dbConnected = await testConnection();
      const healthStatus = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        database: dbConnected ? 'connected' : 'disconnected',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
      };

      logger.info('Health check passed', healthStatus);
      res.json(healthStatus);
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(500).json({
        status: 'ERROR',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });
};
