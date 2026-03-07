import { Request, Response, NextFunction } from 'express';
import * as subscriptionService from '../services/subscriptionService';
import * as featureService from '../services/featureService';
import Cafe from '../models/cafe';
import logger from '../config/logger';

/**
 * Require that the cafe has an active subscription
 */
export const requireActiveSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const cafeId = req.cafeId ?? req.user?.cafe_id;

    if (!cafeId) {
      res.status(400).json({
        error: 'Cafe ID is required',
        code: 'CAFE_ID_REQUIRED'
      });
      return;
    }

    const subscription = await subscriptionService.getCafeSubscription(cafeId);

    if (!subscription) {
      res.status(404).json({
        error: 'Cafe not found',
        code: 'CAFE_NOT_FOUND'
      });
      return;
    }

    if (subscription.status !== subscriptionService.STATUSES.ACTIVE) {
      res.status(403).json({
        error: `Subscription is ${subscription.status}. Please activate your subscription to access this feature.`,
        code: 'SUBSCRIPTION_INACTIVE',
        subscription_status: subscription.status
      });
      return;
    }

    req.subscription = subscription;
    next();
  } catch (error) {
    logger.error('Subscription check error', { message: (error as Error).message });
    res.status(500).json({
      error: 'Failed to verify subscription',
      code: 'SUBSCRIPTION_CHECK_FAILED'
    });
  }
};

/**
 * Require that the cafe has access to a specific feature
 */
export const requireFeature = (featureKey: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cafeId = req.cafeId ?? req.user?.cafe_id;

      if (!cafeId) {
        res.status(400).json({
          error: 'Cafe ID is required',
          code: 'CAFE_ID_REQUIRED'
        });
        return;
      }

      if (req.user && req.user.role === 'superadmin') {
        next();
        return;
      }

      const hasAccess = await featureService.cafeHasFeature(cafeId, featureKey);

      if (!hasAccess) {
        const subscription = await subscriptionService.getCafeSubscription(cafeId);
        const plan = subscription?.plan || 'FREE';

        res.status(403).json({
          error: `This feature is not available on your current plan (${plan}). Please upgrade to access this feature.`,
          code: 'FEATURE_ACCESS_DENIED',
          feature: featureKey,
          current_plan: plan
        });
        return;
      }

      req.subscription = await subscriptionService.getCafeSubscription(cafeId) ?? undefined;
      next();
    } catch (error) {
      logger.error('Feature access check error', { message: (error as Error).message });
      res.status(500).json({
        error: 'Failed to verify feature access',
        code: 'FEATURE_CHECK_FAILED'
      });
    }
  };
};

/**
 * @deprecated Use requireFeature() instead.
 */
export const requireModule = (module: string) => {
  return requireFeature(module);
};

/**
 * Optional: Attach subscription info to request without blocking
 */
export const attachSubscriptionInfo = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const cafeId = req.cafeId ?? req.user?.cafe_id;

    if (cafeId) {
      const subscription = await subscriptionService.getCafeSubscription(cafeId);
      req.subscription = subscription ?? undefined;
    }

    next();
  } catch (error) {
    logger.error('Failed to attach subscription info', { message: (error as Error).message });
    next();
  }
};
