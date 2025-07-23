const jwt = require('jsonwebtoken');
const User = require('../models/user');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

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

    req.user = user;
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

module.exports = { auth, adminAuth, JWT_SECRET }; 