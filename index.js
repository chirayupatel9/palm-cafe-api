const express = require('express');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
const http = require('http');
const WebSocketManager = require('./websocket');
const { initializeDatabase, testConnection } = require('./config/database');
const logger = require('./config/logger');
const { generalLimiter } = require('./middleware/rateLimiter');
const { validateProductionEnv } = require('./config/env');

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

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
      ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000', 'http://localhost:3001'] : [])
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
    logger.debug(`${req.method} ${req.path}`, { origin });
  }
  next();
});

app.use(express.json());

// Serve static files from public directory
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

// Mount API routes
const registerRoutes = require('./routes');
registerRoutes(app);

// Global error handler middleware (must be last)
app.use((err, req, res, next) => {
  const status = err.statusCode || err.status || 500;
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  const isProduction = process.env.NODE_ENV === 'production';
  res.status(status).json({
    error: isProduction ? 'Internal server error' : (err.message || 'Internal server error')
  });
});

// 404 handler for undefined routes
app.use((req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
const startServer = async () => {
  try {
    validateProductionEnv();
    process.env.TZ = 'UTC';
    logger.info('🌍 Server timezone set to UTC for international compatibility');
    
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database. Please check your database configuration.');
      process.exit(1);
    }

    // Initialize database
    await initializeDatabase();

    // Create HTTP server
    const server = http.createServer(app);
    
    // Initialize WebSocket manager
    const wsManager = new WebSocketManager(server);
    
    // Make WebSocket manager available globally for broadcasting updates
    global.wsManager = wsManager;
    
    // Start server
    server.listen(PORT, HOST, () => {
      logger.info(`Cafe Management server running on ${HOST}:${PORT}`);
      logger.info(`API available at http://${HOST}:${PORT}/api`);
      logger.info(`WebSocket available at ws://${HOST}:${PORT}/ws/orders`);
      logger.info(`Local access: http://${HOST}:${PORT}/api`);
      logger.info('Database connected and initialized successfully');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Exit the process as the application is in an undefined state
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

startServer(); 
