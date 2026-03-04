import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'http';
import fs from 'fs';
import WebSocketManager from './websocket';
import { initializeDatabase, testConnection, pool } from './config/database';
import logger from './config/logger';
import { generalLimiter } from './middleware/rateLimiter';
import { validateStartupEnv } from './config/env';
import { requestIdMiddleware } from './middleware/requestId';
import { responseHelpersMiddleware } from './middleware/responseHelpers';
import { requestDurationLogger } from './middleware/requestDurationLogger';
import { publicImagesDir } from './config/paths';
import registerRoutes from './routes';

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);
app.use(requestIdMiddleware);
app.use(responseHelpersMiddleware);
app.use(requestDurationLogger);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowedOrigins = [
        'https://app.cafe.nevyaa.com',
        process.env.FRONTEND_URL,
        process.env.ADMIN_URL,
        ...(process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? ['http://localhost:3000', 'http://localhost:3001'] : [])
      ].filter(Boolean);
      if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Request-ID']
  })
);
app.options('*', cors());
app.use(generalLimiter);
app.use(morgan('combined', { stream: { write: (msg: string) => logger.http(msg.trim()) } }));
app.use((req, _res, next) => {
  if (process.env.NODE_ENV === 'development') {
    logger.debug(`${req.method} ${req.path}`, { origin: req.headers.origin || 'No origin', requestId: req.requestId });
  }
  next();
});
app.use(express.json());

if (!fs.existsSync(publicImagesDir)) {
  fs.mkdirSync(publicImagesDir, { recursive: true });
}
app.use('/images', express.static(publicImagesDir));

registerRoutes(app);

app.use((err: Error & { statusCode?: number; status?: number; code?: string }, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.statusCode || err.status || 500;
  const requestId = req.requestId || null;
  logger.error('Unhandled error', { message: err.message, stack: err.stack, path: req.path, method: req.method, ip: req.ip, requestId });
  const isProduction = process.env.NODE_ENV === 'production';
  const body: Record<string, unknown> = {
    error: isProduction ? 'Internal server error' : (err.message || 'Internal server error'),
    code: err.code || 'INTERNAL_ERROR',
    requestId: requestId || undefined
  };
  res.status(status).json(body);
});

app.use((req: express.Request, res: express.Response) => {
  const requestId = req.requestId || null;
  logger.warn(`404 - Route not found: ${req.method} ${req.path}`, { requestId });
  res.status(404).json({ error: 'Route not found', code: 'NOT_FOUND', ...(requestId ? { requestId } : {}) });
});

let serverInstance: http.Server | null = null;

async function startServer(): Promise<void> {
  try {
    validateStartupEnv();
    process.env.TZ = 'UTC';
    logger.info('Timezone set to UTC');
    const { connect } = await import('./lib/redis');
    await connect();
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database. Please check your database configuration.');
      process.exit(1);
    }
    await initializeDatabase();
    const server = http.createServer(app);
    serverInstance = server;
    const wsManager = new WebSocketManager(server);
    (global as unknown as { wsManager?: WebSocketManager }).wsManager = wsManager;
    server.listen(PORT, HOST, () => {
      logger.info('Server started', {
        NODE_ENV: process.env.NODE_ENV || 'development',
        PORT,
        HOST,
        DB_HOST: process.env.DB_HOST ? '(set)' : '(not set)',
        JWT_SECRET_SET: !!(process.env.JWT_SECRET && String(process.env.JWT_SECRET).trim())
      });
      logger.info(`API: http://${HOST}:${PORT}/api`);
      logger.info(`WebSocket: ws://${HOST}:${PORT}/ws/orders`);
    });
  } catch (error) {
    logger.error('Failed to start server', { message: (error as Error).message });
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Rejection', { reason: String(reason) });
  if (process.env.NODE_ENV === 'production') process.exit(1);
});
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', { message: error.message });
  process.exit(1);
});

function gracefulShutdown(signal: string): void {
  logger.info(`${signal} received: starting graceful shutdown`);
  if (!serverInstance) {
    process.exit(0);
    return;
  }
  serverInstance.close(() => {
    logger.info('HTTP server closed');
    pool.end().then(() => {
      logger.info('Database pool closed');
      process.exit(0);
    }).catch((err: Error) => {
      logger.error('Error closing database pool', { message: err.message });
      process.exit(1);
    });
  });
  setTimeout(() => {
    logger.warn('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (require.main === module) {
  startServer();
}

export default app;
