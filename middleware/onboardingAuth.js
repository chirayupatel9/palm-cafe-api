const Cafe = require('../models/cafe');

/**
 * Middleware to check if cafe has completed onboarding
 * Blocks access to non-onboarding routes if cafe is not onboarded
 * Super Admins are exempt from this check
 */
const requireOnboarding = async (req, res, next) => {
  try {
    // Super Admin bypasses onboarding check
    if (req.user && req.user.role === 'superadmin') {
      return next();
    }

    // Get cafe ID from user or request
    let cafeId = null;
    
    if (req.user && req.user.cafe_id) {
      cafeId = req.user.cafe_id;
    } else if (req.cafeId) {
      cafeId = req.cafeId;
    } else if (req.cafe && req.cafe.id) {
      cafeId = req.cafe.id;
    }

    if (!cafeId) {
      // If we can't determine cafe, allow through (might be a public route)
      return next();
    }

    // Fetch cafe to check onboarding status
    const cafe = await Cafe.getById(cafeId);
    
    if (!cafe) {
      return res.status(404).json({ error: 'Cafe not found' });
    }

    // Check onboarding status
    if (!cafe.is_onboarded) {
      return res.status(403).json({ 
        error: 'Cafe onboarding required',
        code: 'ONBOARDING_REQUIRED',
        cafe_id: cafeId
      });
    }

    // Cafe is onboarded, proceed
    next();
  } catch (error) {
    console.error('Onboarding check error:', error);
    return res.status(500).json({ error: 'Error checking onboarding status' });
  }
};

/**
 * Middleware to allow onboarding routes even if cafe is not onboarded
 * This should be used on onboarding-specific routes
 */
const allowOnboardingRoutes = async (req, res, next) => {
  // Always allow onboarding routes
  next();
};

module.exports = {
  requireOnboarding,
  allowOnboardingRoutes
};
