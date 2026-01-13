const Cafe = require('../models/cafe');
const User = require('../models/user');

/**
 * Middleware to validate cafe access
 * Extracts cafeSlug from route params and validates user has access to that cafe
 */
const validateCafeAccess = async (req, res, next) => {
  try {
    const cafeSlug = req.params.cafeSlug;
    
    if (!cafeSlug) {
      return res.status(400).json({ error: 'Cafe slug is required' });
    }

    // Get cafe by slug
    const cafe = await Cafe.getBySlug(cafeSlug);
    
    if (!cafe) {
      return res.status(404).json({ error: 'Cafe not found' });
    }

    // Attach cafe to request
    req.cafe = cafe;
    req.cafeId = cafe.id;

    // If user is authenticated, validate they have access to this cafe
    if (req.user) {
      // Super Admin can access any cafe
      if (req.user.role === 'superadmin') {
        return next();
      }

      // Regular users must belong to this cafe
      if (req.user.cafe_id !== cafe.id) {
        return res.status(403).json({ 
          error: 'Access denied. You do not have permission to access this cafe.' 
        });
      }
    }

    next();
  } catch (error) {
    console.error('Cafe validation error:', error);
    return res.status(500).json({ error: 'Error validating cafe access' });
  }
};

/**
 * Middleware to ensure user belongs to a cafe (for non-superadmin users)
 */
const requireCafeMembership = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Super Admin doesn't need cafe membership
    if (req.user.role === 'superadmin') {
      return next();
    }

    // Other users must have a cafe_id
    if (!req.user.cafe_id) {
      return res.status(403).json({ 
        error: 'User must be assigned to a cafe' 
      });
    }

    next();
  } catch (error) {
    console.error('Cafe membership validation error:', error);
    return res.status(500).json({ error: 'Error validating cafe membership' });
  }
};

/**
 * Middleware to ensure user is Super Admin
 */
const requireSuperAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ 
        error: 'Super Admin access required' 
      });
    }

    next();
  } catch (error) {
    console.error('Super Admin validation error:', error);
    return res.status(500).json({ error: 'Error validating Super Admin access' });
  }
};

module.exports = {
  validateCafeAccess,
  requireCafeMembership,
  requireSuperAdmin
};
