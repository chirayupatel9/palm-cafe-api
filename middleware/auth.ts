import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { AuthUser, ImpersonationContext } from '../types/express';
import { requireEnv, JWT_SECRET_MIN_LENGTH } from '../config/env';
import logger from '../config/logger';
import User from '../models/user';
import Cafe from '../models/cafe';

dotenv.config();

const raw = requireEnv('JWT_SECRET');
export const JWT_SECRET =
  raw && String(raw).trim()
    ? raw
    : process.env.NODE_ENV === 'production'
      ? ((): never => {
          throw new Error('JWT_SECRET must be set in production');
        })()
      : 'dev-secret-change-in-production';

if (process.env.NODE_ENV === 'production' && JWT_SECRET.length < JWT_SECRET_MIN_LENGTH) {
  throw new Error(`JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters in production`);
}

interface JwtPayload {
  userId: number;
  impersonatedCafeId?: number;
  impersonatedCafeSlug?: string;
  impersonatedRole?: string;
}

export async function auth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ error: 'Access denied. No token provided.' });
      return;
    }
    const decoded = jwt.verify(token, JWT_SECRET, {
      clockTolerance: 600,
      ignoreExpiration: false
    }) as JwtPayload;
    const user = await User.findById(decoded.userId) as AuthUser | null;
    if (!user) {
      res.status(401).json({ error: 'Invalid token.' });
      return;
    }
    if (decoded.impersonatedCafeId != null && decoded.impersonatedCafeSlug) {
      if (user.role !== 'superadmin') {
        res.status(403).json({ error: 'Impersonation token invalid. Original user is not a Super Admin.' });
        return;
      }
      const cafe = await Cafe.getById(decoded.impersonatedCafeId);
      if (!cafe || !cafe.is_active) {
        res.status(403).json({ error: 'Impersonation token invalid. Cafe not found or inactive.' });
        return;
      }
      req.user = { ...user };
      req.user.cafe_id = decoded.impersonatedCafeId;
      req.user.cafe_slug = decoded.impersonatedCafeSlug;
      req.user.cafe_name = cafe.name;
      req.user.effective_role = decoded.impersonatedRole || 'admin';
      req.impersonation = {
        isImpersonating: true,
        cafeId: decoded.impersonatedCafeId,
        cafeSlug: decoded.impersonatedCafeSlug,
        cafeName: cafe.name,
        impersonatedRole: decoded.impersonatedRole || 'admin',
        originalUserId: decoded.userId,
        originalRole: user.role
      } as ImpersonationContext;
    } else {
      req.user = user;
      req.impersonation = { isImpersonating: false };
    }
    next();
  } catch (error) {
    const err = error as { name?: string };
    logger.warn('JWT verification failed', { name: err.name });
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token has expired. Please log in again.', code: 'TOKEN_EXPIRED' });
      return;
    }
    if (err.name === 'JsonWebTokenError') {
      res.status(401).json({ error: 'Invalid token.', code: 'INVALID_TOKEN' });
      return;
    }
    res.status(401).json({ error: 'Authentication failed.', code: 'VERIFICATION_FAILED' });
  }
}

export async function adminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await auth(req, res, () => {
      if (req.user && req.user.role !== 'admin') {
        res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        return;
      }
      next();
    });
  } catch {
    res.status(401).json({ error: 'Invalid token.' });
  }
}

export async function chefAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await auth(req, res, () => {
      if (req.user && req.user.role !== 'chef' && req.user.role !== 'admin') {
        res.status(403).json({ error: 'Access denied. Chef or admin privileges required.' });
        return;
      }
      next();
    });
  } catch {
    res.status(401).json({ error: 'Invalid token.' });
  }
}
