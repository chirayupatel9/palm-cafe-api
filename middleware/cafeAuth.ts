import { Request, Response, NextFunction } from 'express';
import Cafe from '../models/cafe';
import logger from '../config/logger';

/**
 * Middleware to validate cafe access.
 * Extracts cafeSlug from route params and validates user has access to that cafe.
 */
export const validateCafeAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const cafeSlug = req.params.cafeSlug as string | undefined;

    if (!cafeSlug) {
      res.status(400).json({ error: 'Cafe slug is required' });
      return;
    }

    const cafe = await Cafe.getBySlug(cafeSlug);

    if (!cafe) {
      res.status(404).json({ error: 'Cafe not found' });
      return;
    }

    req.cafe = cafe;
    req.cafeId = cafe.id;

    if (req.user) {
      if (req.impersonation && req.impersonation.isImpersonating) {
        if (req.impersonation.cafeId !== cafe.id) {
          res.status(403).json({
            error: 'Access denied. Impersonation context does not match requested cafe.'
          });
          return;
        }
        next();
        return;
      }

      if (req.user.role === 'superadmin') {
        next();
        return;
      }

      if (req.user.cafe_id !== cafe.id) {
        res.status(403).json({
          error: 'Access denied. You do not have permission to access this cafe.'
        });
        return;
      }
    }

    next();
  } catch (error) {
    logger.error('Cafe validation error:', error as Error);
    res.status(500).json({ error: 'Error validating cafe access' });
  }
};

/**
 * Middleware to ensure user belongs to a cafe (for non-superadmin users)
 */
export const requireCafeMembership = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (req.impersonation && req.impersonation.isImpersonating) {
      next();
      return;
    }

    if (req.user.role === 'superadmin') {
      next();
      return;
    }

    if (!req.user.cafe_id) {
      res.status(403).json({
        error: 'User must be assigned to a cafe'
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Cafe membership validation error:', error as Error);
    res.status(500).json({ error: 'Error validating cafe membership' });
  }
};

/**
 * Middleware to ensure user is Super Admin
 */
export const requireSuperAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (req.user.role !== 'superadmin') {
      res.status(403).json({
        error: 'Super Admin access required'
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Super Admin validation error:', error as Error);
    res.status(500).json({ error: 'Error validating Super Admin access' });
  }
};
