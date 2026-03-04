import { Request, Response, NextFunction } from 'express';
import Cafe from '../models/cafe';
import logger from '../config/logger';

/**
 * Middleware to check if cafe has completed onboarding.
 * Blocks access to non-onboarding routes if cafe is not onboarded.
 * Super Admins are exempt from this check.
 */
export const requireOnboarding = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.user && req.user.role === 'superadmin') {
      next();
      return;
    }

    let cafeId: number | null = null;

    if (req.user && req.user.cafe_id) {
      cafeId = req.user.cafe_id;
    } else if (req.cafeId) {
      cafeId = req.cafeId;
    } else if (req.cafe && (req.cafe as { id?: number }).id) {
      cafeId = (req.cafe as { id: number }).id;
    }

    if (!cafeId) {
      next();
      return;
    }

    const cafe = await Cafe.getById(cafeId);

    if (!cafe) {
      res.status(404).json({ error: 'Cafe not found' });
      return;
    }

    if (!cafe.is_onboarded) {
      res.status(403).json({
        error: 'Cafe onboarding required',
        code: 'ONBOARDING_REQUIRED',
        cafe_id: cafeId
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Onboarding check error', { message: (error as Error).message });
    res.status(500).json({ error: 'Error checking onboarding status' });
  }
};

/**
 * Middleware to allow onboarding routes even if cafe is not onboarded.
 */
export const allowOnboardingRoutes = async (
  _req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  next();
};
