const subscriptionService = require('../services/subscriptionService');
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
 * Require that the cafe has access to a specific module
 * 
 * @param {string} module - The module name to check
 */
const requireModule = (module) => {
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

      const hasAccess = await subscriptionService.cafeHasModuleAccess(cafeId, module);
      
      if (!hasAccess) {
        const subscription = await subscriptionService.getCafeSubscription(cafeId);
        const plan = subscription?.plan || 'FREE';
        
        return res.status(403).json({ 
          error: `This feature requires a PRO subscription. Your current plan: ${plan}`,
          code: 'MODULE_ACCESS_DENIED',
          module: module,
          required_plan: 'PRO',
          current_plan: plan
        });
      }

      // Attach subscription info to request
      req.subscription = await subscriptionService.getCafeSubscription(cafeId);
      next();
    } catch (error) {
      console.error('Module access check error:', error);
      return res.status(500).json({ 
        error: 'Failed to verify module access',
        code: 'MODULE_CHECK_FAILED'
      });
    }
  };
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
  requireModule,
  attachSubscriptionInfo
};
