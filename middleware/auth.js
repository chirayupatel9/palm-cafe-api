const jwt = require('jsonwebtoken');
const User = require('../models/user');

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production environment');
  }
  return 'your-secret-key-change-in-production';
})();

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    // Add clock tolerance for timezone differences (10 minutes for better compatibility)
    const decoded = jwt.verify(token, JWT_SECRET, { 
      clockTolerance: 600, // 10 minutes tolerance for timezone differences
      ignoreExpiration: false 
    });
    
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token.' });
    }

    // Handle impersonation - if token contains impersonation data, apply it
    if (decoded.impersonatedCafeId && decoded.impersonatedCafeSlug) {
      // Verify original user is still a superadmin (security check)
      if (user.role !== 'superadmin') {
        return res.status(403).json({ 
          error: 'Impersonation token invalid. Original user is not a Super Admin.' 
        });
      }

      // Get cafe information for impersonation
      const Cafe = require('../models/cafe');
      const cafe = await Cafe.getById(decoded.impersonatedCafeId);
      
      if (!cafe || !cafe.is_active) {
        return res.status(403).json({ 
          error: 'Impersonation token invalid. Cafe not found or inactive.' 
        });
      }

      // Attach impersonation context to request
      req.user = user; // Original user (Super Admin)
      
      // Set effective cafe_id and role for impersonation (so existing routes work)
      req.user.cafe_id = decoded.impersonatedCafeId;
      req.user.cafe_slug = decoded.impersonatedCafeSlug;
      req.user.cafe_name = cafe.name;
      req.user.effective_role = decoded.impersonatedRole || 'admin'; // Store effective role
      
      req.impersonation = {
        isImpersonating: true,
        cafeId: decoded.impersonatedCafeId,
        cafeSlug: decoded.impersonatedCafeSlug,
        cafeName: cafe.name,
        impersonatedRole: decoded.impersonatedRole || 'admin',
        originalUserId: decoded.userId,
        originalRole: user.role
      };
    } else {
      // Normal authentication - no impersonation
      req.user = user;
      req.impersonation = {
        isImpersonating: false
      };
    }

    next();
  } catch (error) {
    console.error('JWT verification error:', error.message);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      token: token ? `${token.substring(0, 20)}...` : 'no token'
    });
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token has expired. Please log in again.',
        code: 'TOKEN_EXPIRED',
        details: error.message
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token format.',
        code: 'INVALID_TOKEN',
        details: error.message
      });
    } else {
      return res.status(401).json({ 
        error: 'Token verification failed.',
        code: 'VERIFICATION_FAILED',
        details: error.message
      });
    }
  }
};

const adminAuth = async (req, res, next) => {
  try {
    await auth(req, res, () => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
      }
      next();
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token.' });
  }
};

const chefAuth = async (req, res, next) => {
  try {
    await auth(req, res, () => {
      if (req.user.role !== 'chef' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Chef or admin privileges required.' });
      }
      next();
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token.' });
  }
};

module.exports = { auth, adminAuth, chefAuth, JWT_SECRET }; 