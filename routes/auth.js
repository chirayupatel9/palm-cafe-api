const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { auth, chefAuth, JWT_SECRET } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const logger = require('../config/logger');

module.exports = function registerAuth(app) {
  // Register new user
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }

      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      const user = await User.create({ username, email, password });

      const token = jwt.sign(
        {
          userId: user.id,
          iat: Math.floor(Date.now() / 1000)
        },
        JWT_SECRET,
        {
          expiresIn: '24h',
          algorithm: 'HS256'
        }
      );

      res.status(201).json({
        message: 'User registered successfully',
        user: { id: user.id, username: user.username, email: user.email, role: user.role },
        token
      });
    } catch (error) {
      logger.error('Registration error:', error);
      res.status(500).json({ error: 'Failed to register user' });
    }
  });

  app.post('/api/auth/register-admin', auth, async (req, res) => {
    try {
      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }

      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      const user = await User.create({ username, email, password, role: 'admin' });

      res.status(201).json({
        message: 'Admin registered successfully',
        user: { id: user.id, username: user.username, email: user.email, role: user.role }
      });
    } catch (error) {
      logger.error('Admin registration error:', error);
      res.status(500).json({ error: 'Failed to register admin' });
    }
  });

  app.post('/api/auth/register-chef', chefAuth, async (req, res) => {
    try {
      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }

      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      const user = await User.create({ username, email, password, role: 'chef' });

      res.status(201).json({
        message: 'Chef registered successfully',
        user: { id: user.id, username: user.username, email: user.email, role: user.role }
      });
    } catch (error) {
      logger.error('Chef registration error:', error);
      res.status(500).json({ error: 'Failed to register chef' });
    }
  });

  app.post('/api/auth/register-reception', chefAuth, async (req, res) => {
    try {
      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }

      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      const user = await User.create({ username, email, password, role: 'reception' });

      res.status(201).json({
        message: 'Reception registered successfully',
        user: { id: user.id, username: user.username, email: user.email, role: user.role }
      });
    } catch (error) {
      logger.error('Reception registration error:', error);
      res.status(500).json({ error: 'Failed to register reception' });
    }
  });

  app.post('/api/auth/register-superadmin', auth, async (req, res) => {
    try {
      if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Only superadmins can register new superadmins' });
      }

      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }

      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      const user = await User.create({ username, email, password, role: 'superadmin' });

      res.status(201).json({
        message: 'Superadmin registered successfully',
        user: { id: user.id, username: user.username, email: user.email, role: user.role }
      });
    } catch (error) {
      logger.error('Superadmin registration error:', error);
      res.status(500).json({ error: 'Failed to register superadmin' });
    }
  });

  // Login, profile, server time, cors-test are registered after superadmin in main index order;
  // we register them here in auth.js so all auth-related routes live together
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = await User.findByIdWithCafe((await User.findByEmail(email))?.id);
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const userWithPassword = await User.findByEmail(email);
      const isValidPassword = await User.validatePassword(userWithPassword, password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      await User.updateLastLogin(user.id);

      const now = Math.floor(Date.now() / 1000);
      const token = jwt.sign(
        {
          userId: user.id,
          iat: now,
          exp: now + (24 * 60 * 60)
        },
        JWT_SECRET,
        {
          algorithm: 'HS256'
        }
      );

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          cafe_id: user.cafe_id,
          cafe_slug: user.cafe_slug,
          cafe_name: user.cafe_name
        },
        token
      });
    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({ error: 'Failed to login' });
    }
  });

  app.get('/api/auth/profile', auth, async (req, res) => {
    try {
      const user = await User.findByIdWithCafe(req.user.id);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (req.impersonation && req.impersonation.isImpersonating) {
        res.json({
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: req.impersonation.impersonatedRole,
            cafe_id: req.impersonation.cafeId,
            cafe_slug: req.impersonation.cafeSlug,
            cafe_name: req.impersonation.cafeName
          },
          impersonation: {
            isImpersonating: true,
            cafeId: req.impersonation.cafeId,
            cafeSlug: req.impersonation.cafeSlug,
            cafeName: req.impersonation.cafeName,
            originalUserId: req.impersonation.originalUserId,
            originalRole: req.impersonation.originalRole
          }
        });
      } else {
        res.json({
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            cafe_id: user.cafe_id,
            cafe_slug: user.cafe_slug,
            cafe_name: user.cafe_name
          },
          impersonation: {
            isImpersonating: false
          }
        });
      }
    } catch (error) {
      logger.error('Profile error:', error);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  });

  app.get('/api/server/time', async (req, res) => {
    try {
      const now = new Date();
      res.json({
        serverTime: now.toISOString(),
        serverTimeLocal: now.toString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timestamp: Math.floor(now.getTime() / 1000),
        cors: 'working'
      });
    } catch (error) {
      logger.error('Time info error:', error);
      res.status(500).json({ error: 'Failed to get server time' });
    }
  });

  app.get('/api/cors-test', (req, res) => {
    res.json({
      message: 'CORS is working!',
      origin: req.headers.origin,
      method: req.method,
      timestamp: new Date().toISOString(),
      allowedOrigins: [
        process.env.FRONTEND_URL,
        process.env.ADMIN_URL || 'http://localhost:3001',
        'https://palm-cafe-api-r6rx.vercel.app',
        'https://palm-cafe-ui.vercel.app',
        'https://palm-cafe.vercel.app',
        'Any .vercel.app subdomain',
        'Any HTTPS origin'
      ]
    });
  });
};
