import { Application, Request, Response } from 'express';
import { testConnection } from '../config/database';
import logger from '../config/logger';

export default function registerHealth(app: Application): void {
  app.get('/api/health', async (req: Request, res: Response) => {
    const requestId = req.requestId || null;
    try {
      const dbConnected = await testConnection();
      const healthStatus: Record<string, unknown> = {
        status: dbConnected ? 'OK' : 'DEGRADED',
        timestamp: new Date().toISOString(),
        database: dbConnected ? 'connected' : 'disconnected',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
      };
      if (requestId) healthStatus.requestId = requestId;
      if (dbConnected) {
        res.json(healthStatus);
      } else {
        logger.warn('Health check: database disconnected', { requestId });
        res.status(503).json(healthStatus);
      }
    } catch (error) {
      logger.error('Health check failed', { error: (error as Error).message, requestId });
      res.status(503).json({
        status: 'ERROR',
        timestamp: new Date().toISOString(),
        error: 'Internal server error',
        database: 'unknown',
        code: 'HEALTH_CHECK_FAILED',
        requestId: requestId || undefined
      });
    }
  });

  app.get('/api/readiness', async (req: Request, res: Response) => {
    const requestId = req.requestId || null;
    try {
      const dbConnected = await testConnection();
      const body: Record<string, unknown> = {
        ready: dbConnected,
        timestamp: new Date().toISOString(),
        database: dbConnected ? 'connected' : 'disconnected',
        code: dbConnected ? undefined : 'NOT_READY',
        requestId: requestId || undefined
      };
      if (dbConnected) res.status(200).json(body);
      else res.status(503).json(body);
    } catch (error) {
      logger.error('Readiness check failed', { error: (error as Error).message, requestId });
      res.status(503).json({
        ready: false,
        timestamp: new Date().toISOString(),
        database: 'unknown',
        code: 'READINESS_CHECK_FAILED',
        requestId: requestId || undefined
      });
    }
  });
}
