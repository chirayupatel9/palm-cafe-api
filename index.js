const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const morgan = require('morgan');
const http = require('http');
const WebSocketManager = require('./websocket');
const { initializeDatabase, testConnection, pool } = require('./config/database');
const logger = require('./config/logger');
const { generalLimiter } = require('./middleware/rateLimiter');
const { validateStartupEnv } = require('./config/env');
const requestIdMiddleware = require('./middleware/requestId');
const responseHelpersMiddleware = require('./routes/responseHelpers');
const requestDurationLogger = require('./middleware/requestDurationLogger');

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Security headers (before other middleware)
app.use(helmet({ contentSecurityPolicy: false }));

// Request ID for tracing (before other middleware so all logs can use it)
app.use(requestIdMiddleware);
app.use(responseHelpersMiddleware);
app.use(requestDurationLogger);

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      // Production origins
      'https://app.cafe.nevyaa.com',
      // Development origins (from environment variables)
      process.env.FRONTEND_URL,
      process.env.ADMIN_URL,
      // Fallback for development
      ...((process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') ? ['http://localhost:3000', 'http://localhost:3001'] : [])
    ].filter(Boolean); // Remove null/undefined values
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Request-ID']
}));

// Handle preflight requests
app.options('*', cors());

// Apply general rate limiting
app.use(generalLimiter);

// HTTP request logging
app.use(morgan('combined', { stream: logger.stream }));

// Request logging (debug level to avoid noise in production)
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    const origin = req.headers.origin || 'No origin';
    logger.debug(`${req.method} ${req.path}`, { origin, requestId: req.requestId });
  }
  next();
});

app.use(express.json());

// Serve static files from public directory
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

// Mount API routes
const registerRoutes = require('./routes');
registerRoutes(app);

// Global error handler middleware (must be last). Never expose stack traces in production.
app.use((err, req, res, next) => {
  const status = err.statusCode || err.status || 500;
  const requestId = req.requestId || null;
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    requestId
  });

  const isProduction = process.env.NODE_ENV === 'production';
  const body = {
    error: isProduction ? 'Internal server error' : (err.message || 'Internal server error'),
    code: err.code || 'INTERNAL_ERROR',
    requestId: requestId || undefined
  };
  if (requestId) body.requestId = requestId;
  res.status(status).json(body);
});

// 404 handler for undefined routes
app.use((req, res) => {
  const requestId = req.requestId || null;
  logger.warn(`404 - Route not found: ${req.method} ${req.path}`, { requestId });
  const body = { error: 'Route not found', code: 'NOT_FOUND' };
  if (requestId) body.requestId = requestId;
  res.status(404).json(body);
});

// Initialize database and start server
let serverInstance = null;

const startServer = async () => {
  try {
    validateStartupEnv();
    process.env.TZ = 'UTC';
    logger.info('Timezone set to UTC');

    await require('./lib/redis').connect();

    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database. Please check your database configuration.');
      process.exit(1);
    }

    await initializeDatabase();

    const server = http.createServer(app);
    serverInstance = server;

    const wsManager = new WebSocketManager(server);
    global.wsManager = wsManager;

    server.listen(PORT, HOST, () => {
      const safeConfig = {
        NODE_ENV: process.env.NODE_ENV || 'development',
        PORT,
        HOST,
        DB_HOST: process.env.DB_HOST ? '(set)' : '(not set)',
        JWT_SECRET_SET: !!(process.env.JWT_SECRET && String(process.env.JWT_SECRET).trim())
      };
      logger.info('Server started', safeConfig);
      logger.info(`API: http://${HOST}:${PORT}/api`);
      logger.info(`WebSocket: ws://${HOST}:${PORT}/ws/orders`);
    });
  } catch (error) {
    logger.error('Failed to start server', { message: error.message });
    process.exit(1);
  }
};

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason: String(reason) });
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { message: error.message });
  process.exit(1);
});

function gracefulShutdown(signal) {
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
    }).catch((err) => {
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

module.exports = app;
