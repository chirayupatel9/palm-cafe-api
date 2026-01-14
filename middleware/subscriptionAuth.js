const subscriptionService = require('../services/subscriptionService');
const featureService = require('../services/featureService');
const Cafe = require('../models/cafe');

/**
 * Middleware to enforce subscription-based access control
 * 
 * Usage:
 * - requireModule('orders') - Check if cafe has access to 'orders' module
 * - requireActiveSubscription() - Check if cafe subscription is active
 */

/**
 * Require that the cafe has an active subscription
 */
const requireActiveSubscription = async (req, res, next) => {
  try {
    const cafeId = req.cafeId || req.user?.cafe_id;
    
    if (!cafeId) {
      return res.status(400).json({ 
        error: 'Cafe ID is required',
        code: 'CAFE_ID_REQUIRED'
      });
    }

    const subscription = await subscriptionService.getCafeSubscription(cafeId);
    
    if (!subscription) {
      return res.status(404).json({ 
        error: 'Cafe not found',
        code: 'CAFE_NOT_FOUND'
      });
    }

    if (subscription.status !== subscriptionService.STATUSES.ACTIVE) {
      return res.status(403).json({ 
        error: `Subscription is ${subscription.status}. Please activate your subscription to access this feature.`,
        code: 'SUBSCRIPTION_INACTIVE',
        subscription_status: subscription.status
      });
    }

    // Attach subscription info to request
    req.subscription = subscription;
    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    return res.status(500).json({ 
      error: 'Failed to verify subscription',
      code: 'SUBSCRIPTION_CHECK_FAILED'
    });
  }
};

/**
 * Require that the cafe has access to a specific feature
 * 
 * @param {string} featureKey - The feature key to check
 */
const requireFeature = (featureKey) => {
  return async (req, res, next) => {
    try {
      const cafeId = req.cafeId || req.user?.cafe_id;
      
      if (!cafeId) {
        return res.status(400).json({ 
          error: 'Cafe ID is required',
          code: 'CAFE_ID_REQUIRED'
        });
      }

      // Super Admin bypass
      if (req.user && req.user.role === 'superadmin') {
        return next();
      }

      const hasAccess = await featureService.cafeHasFeature(cafeId, featureKey);
      
      if (!hasAccess) {
        const subscription = await subscriptionService.getCafeSubscription(cafeId);
        const plan = subscription?.plan || 'FREE';
        
        return res.status(403).json({ 
          error: `This feature is not available on your current plan (${plan}). Please upgrade to access this feature.`,
          code: 'FEATURE_ACCESS_DENIED',
          feature: featureKey,
          current_plan: plan
        });
      }

      // Attach subscription info to request
      req.subscription = await subscriptionService.getCafeSubscription(cafeId);
      next();
    } catch (error) {
      console.error('Feature access check error:', error);
      return res.status(500).json({ 
        error: 'Failed to verify feature access',
        code: 'FEATURE_CHECK_FAILED'
      });
    }
  };
};

/**
 * Require that the cafe has access to a specific module
 * @deprecated Use requireFeature() instead. This function is kept for backward compatibility only.
 * 
 * @param {string} module - The module name to check (same as feature key)
 * @returns {Function} Middleware function that checks feature access
 */
const requireModule = (module) => {
  // Map old module names to feature keys (they're the same, so just pass through)
  return requireFeature(module);
};

/**
 * Optional: Attach subscription info to request without blocking
 * Useful for UI to show/hide features
 */
const attachSubscriptionInfo = async (req, res, next) => {
  try {
    const cafeId = req.cafeId || req.user?.cafe_id;
    
    if (cafeId) {
      const subscription = await subscriptionService.getCafeSubscription(cafeId);
      req.subscription = subscription;
    }
    
    next();
  } catch (error) {
    // Don't block request if subscription check fails
    console.error('Failed to attach subscription info:', error);
    next();
  }
};

module.exports = {
  requireActiveSubscription,
  requireFeature,
  requireModule, // Deprecated, use requireFeature
  attachSubscriptionInfo
};
