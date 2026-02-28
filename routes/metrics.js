/**
 * Lightweight internal metrics endpoint. No sensitive data.
 * Optionally restricted to admin role.
 */
const metrics = require('../lib/metrics');
const { auth, adminAuth } = require('../middleware/auth');

module.exports = function registerMetrics(app) {
  app.get('/api/metrics', auth, adminAuth, (req, res) => {
    const { requestCount, errorCount } = metrics.getCounts();
    res.json({
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
      requestCount,
      errorCount
    });
  });
};
