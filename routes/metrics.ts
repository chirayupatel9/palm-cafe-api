import { Application, Request, Response } from 'express';
import * as metrics from '../lib/metrics';
import { auth, adminAuth } from '../middleware/auth';

/**
 * Lightweight internal metrics endpoint. No sensitive data.
 * Optionally restricted to admin role.
 */
export default function registerMetrics(app: Application): void {
  app.get('/api/metrics', auth, adminAuth, (req: Request, res: Response) => {
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
}
