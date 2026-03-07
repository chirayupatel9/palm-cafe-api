import { Application, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/user';
import Cafe from '../models/cafe';
import { auth, chefAuth, JWT_SECRET } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';
import { accountLockout, recordFailedAttempt, clearAttempts } from '../middleware/accountLockout';
import { registerValidation, loginValidation, handleValidationErrors } from '../middleware/validateAuth';
import logger from '../config/logger';

export default function registerAuth(app: Application): void {
  app.post('/api/auth/register', authLimiter, registerValidation, handleValidationErrors, async (req: Request, res: Response) => {
    try {
      const { username, email, password, cafe_id: bodyCafeId } = req.body as { username?: string; email?: string; password?: string; cafe_id?: number };
      const u = String(username ?? '').trim();
      const e = String(email ?? '').trim();
      const p = String(password ?? '');
      const existingUser = await User.findByEmail(e);
      if (existingUser) {
        res.status(400).json({ error: 'User with this email already exists' });
        return;
      }
      let cafeId: number | null = bodyCafeId != null ? parseInt(String(bodyCafeId), 10) : null;
      if (cafeId == null || !Number.isInteger(cafeId)) {
        const defaultCafe = await Cafe.getFirstActive();
        if (defaultCafe) cafeId = defaultCafe.id;
      }
      const user = await User.create({ username: u, email: e, password: p, cafe_id: cafeId ?? undefined });
      const token = jwt.sign({ userId: user.id, iat: Math.floor(Date.now() / 1000) }, JWT_SECRET, { expiresIn: '24h', algorithm: 'HS256' });
      res.status(201).json({ message: 'User registered successfully', user: { id: user.id, username: user.username, email: user.email, role: user.role }, token });
    } catch (error) {
      logger.error('Registration error', { error: (error as Error).message, requestId: req.requestId });
      res.status(500).json({ error: 'Failed to register user' });
    }
  });

  app.post('/api/auth/register-admin', auth, registerValidation, handleValidationErrors, async (req: Request, res: Response) => {
    try {
      const { username, email, password } = req.body as { username?: string; email?: string; password?: string };
      const u = String(username ?? '').trim();
      const e = String(email ?? '').trim();
      const p = String(password ?? '');
      const existingUser = await User.findByEmail(e);
      if (existingUser) {
        res.status(400).json({ error: 'User with this email already exists' });
        return;
      }
      const user = await User.create({ username: u, email: e, password: p, role: 'admin' });
      res.status(201).json({ message: 'Admin registered successfully', user: { id: user.id, username: user.username, email: user.email, role: user.role } });
    } catch (error) {
      logger.error('Admin registration error', { error: (error as Error).message, requestId: req.requestId });
      res.status(500).json({ error: 'Failed to register admin' });
    }
  });

  app.post('/api/auth/register-chef', chefAuth, registerValidation, handleValidationErrors, async (req: Request, res: Response) => {
    try {
      const { username, email, password } = req.body as { username?: string; email?: string; password?: string };
      const u = String(username ?? '').trim();
      const e = String(email ?? '').trim();
      const p = String(password ?? '');
      const existingUser = await User.findByEmail(e);
      if (existingUser) {
        res.status(400).json({ error: 'User with this email already exists' });
        return;
      }
      const user = await User.create({ username: u, email: e, password: p, role: 'chef' });
      res.status(201).json({ message: 'Chef registered successfully', user: { id: user.id, username: user.username, email: user.email, role: user.role } });
    } catch (error) {
      logger.error('Chef registration error', { error: (error as Error).message, requestId: req.requestId });
      res.status(500).json({ error: 'Failed to register chef' });
    }
  });

  app.post('/api/auth/register-reception', chefAuth, registerValidation, handleValidationErrors, async (req: Request, res: Response) => {
    try {
      const { username, email, password } = req.body as { username?: string; email?: string; password?: string };
      const u = String(username ?? '').trim();
      const e = String(email ?? '').trim();
      const p = String(password ?? '');
      const existingUser = await User.findByEmail(e);
      if (existingUser) {
        res.status(400).json({ error: 'User with this email already exists' });
        return;
      }
      const user = await User.create({ username: u, email: e, password: p, role: 'reception' });
      res.status(201).json({ message: 'Reception registered successfully', user: { id: user.id, username: user.username, email: user.email, role: user.role } });
    } catch (error) {
      logger.error('Reception registration error', { error: (error as Error).message, requestId: req.requestId });
      res.status(500).json({ error: 'Failed to register reception' });
    }
  });

  app.post('/api/auth/register-superadmin', auth, registerValidation, handleValidationErrors, async (req: Request, res: Response) => {
    try {
      if (req.user && req.user.role !== 'superadmin') {
        res.status(403).json({ error: 'Only superadmins can register new superadmins' });
        return;
      }
      const { username, email, password } = req.body as { username?: string; email?: string; password?: string };
      const u = String(username ?? '').trim();
      const e = String(email ?? '').trim();
      const p = String(password ?? '');
      const existingUser = await User.findByEmail(e);
      if (existingUser) {
        res.status(400).json({ error: 'User with this email already exists' });
        return;
      }
      const user = await User.create({ username: u, email: e, password: p, role: 'superadmin' });
      res.status(201).json({ message: 'Superadmin registered successfully', user: { id: user.id, username: user.username, email: user.email, role: user.role } });
    } catch (error) {
      logger.error('Superadmin registration error', { error: (error as Error).message, requestId: req.requestId });
      res.status(500).json({ error: 'Failed to register superadmin' });
    }
  });

  app.post('/api/auth/login', authLimiter, accountLockout, loginValidation, handleValidationErrors, async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      const e = String(email ?? '').trim();
      const p = String(password ?? '');
      const byEmail = await User.findByEmail(e);
      if (!byEmail) {
        await recordFailedAttempt(req);
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }
      const user = await User.findByIdWithCafe(byEmail.id);
      if (!user) {
        await recordFailedAttempt(req);
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }
      const userWithPassword = await User.findByEmail(e);
      const isValidPassword = userWithPassword ? await User.validatePassword(userWithPassword as import('../models/user').UserRow & { password: string }, p) : false;
      if (!isValidPassword) {
        await recordFailedAttempt(req);
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }
      await clearAttempts(req);
      await User.updateLastLogin(user.id);
      const now = Math.floor(Date.now() / 1000);
      const token = jwt.sign({ userId: user.id, iat: now, exp: now + 24 * 60 * 60 }, JWT_SECRET, { algorithm: 'HS256' });
      res.json({
        message: 'Login successful',
        user: { id: user.id, username: user.username, email: user.email, role: user.role, cafe_id: user.cafe_id, cafe_slug: user.cafe_slug, cafe_name: user.cafe_name },
        token
      });
    } catch (error) {
      logger.error('Login error', { error: (error as Error).message, requestId: req.requestId });
      res.status(500).json({ error: 'Failed to login' });
    }
  });

  app.get('/api/auth/profile', auth, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      const user = await User.findByIdWithCafe(req.user.id);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      if (req.impersonation && req.impersonation.isImpersonating) {
        res.json({
          user: { id: user.id, username: user.username, email: user.email, role: req.impersonation.impersonatedRole, cafe_id: req.impersonation.cafeId, cafe_slug: req.impersonation.cafeSlug, cafe_name: req.impersonation.cafeName },
          impersonation: { isImpersonating: true, cafeId: req.impersonation.cafeId, cafeSlug: req.impersonation.cafeSlug, cafeName: req.impersonation.cafeName, originalUserId: req.impersonation.originalUserId, originalRole: req.impersonation.originalRole }
        });
      } else {
        res.json({
          user: { id: user.id, username: user.username, email: user.email, role: user.role, cafe_id: user.cafe_id, cafe_slug: user.cafe_slug, cafe_name: user.cafe_name },
          impersonation: { isImpersonating: false }
        });
      }
    } catch (error) {
      logger.error('Profile error:', error);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  });

  app.get('/api/server/time', (_req: Request, res: Response) => {
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

  app.get('/api/cors-test', (req: Request, res: Response) => {
    res.json({
      message: 'CORS is working!',
      origin: req.headers.origin,
      method: req.method,
      timestamp: new Date().toISOString(),
      allowedOrigins: [process.env.FRONTEND_URL, process.env.ADMIN_URL || 'http://localhost:3001', 'https://palm-cafe-api-r6rx.vercel.app', 'https://palm-cafe-ui.vercel.app', 'https://palm-cafe.vercel.app', 'Any .vercel.app subdomain', 'Any HTTPS origin']
    });
  });
}
