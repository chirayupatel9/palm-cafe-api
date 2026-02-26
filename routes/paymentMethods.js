const jwt = require('jsonwebtoken');
const User = require('../models/user');
const Cafe = require('../models/cafe');
const PaymentMethod = require('../models/paymentMethod');
const { auth, adminAuth, JWT_SECRET } = require('../middleware/auth');
const logger = require('../config/logger');

module.exports = function registerPaymentMethods(app) {
  app.get('/api/payment-methods', async (req, res) => {
    try {
      let cafeId = null;

      const token = req.header('Authorization')?.replace('Bearer ', '');
      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET, { clockTolerance: 600 });
          const user = await User.findById(decoded.userId);
          if (user) {
            const userWithCafe = await User.findByIdWithCafe(user.id);
            if (userWithCafe && userWithCafe.cafe_id) {
              cafeId = userWithCafe.cafe_id;
            }
          }
        } catch (error) {
          // Token invalid or expired
        }
      }

      if (!cafeId) {
        const cafeSlug = req.query.cafeSlug || 'default';
        try {
          const cafe = await Cafe.getBySlug(cafeSlug);
          if (cafe) {
            cafeId = cafe.id;
          }
        } catch (error) {
          // Cafe might not exist
        }
      }

      const paymentMethods = await PaymentMethod.getAll(cafeId);
      res.json(paymentMethods);
    } catch (error) {
      logger.error('Error fetching payment methods:', error);
      res.status(500).json({ error: 'Failed to fetch payment methods' });
    }
  });

  app.get('/api/admin/payment-methods', auth, adminAuth, async (req, res) => {
    try {
      let cafeId = null;

      if (req.user.role !== 'superadmin') {
        const userWithCafe = await User.findByIdWithCafe(req.user.id);
        if (userWithCafe && userWithCafe.cafe_id) {
          cafeId = userWithCafe.cafe_id;
        }
      }

      const paymentMethods = await PaymentMethod.getAllForAdmin(cafeId);
      res.json(paymentMethods);
    } catch (error) {
      logger.error('Error fetching payment methods:', error);
      res.status(500).json({ error: 'Failed to fetch payment methods' });
    }
  });

  app.post('/api/admin/payment-methods', auth, adminAuth, async (req, res) => {
    try {
      const paymentMethodData = req.body;

      if (!paymentMethodData.name || !paymentMethodData.code) {
        return res.status(400).json({ error: 'Name and code are required' });
      }

      if (req.user.role !== 'superadmin') {
        const userWithCafe = await User.findByIdWithCafe(req.user.id);
        if (userWithCafe && userWithCafe.cafe_id) {
          paymentMethodData.cafe_id = userWithCafe.cafe_id;
        } else {
          return res.status(403).json({ error: 'User must belong to a cafe' });
        }
      }

      const newPaymentMethod = await PaymentMethod.create(paymentMethodData);
      res.status(201).json(newPaymentMethod);
    } catch (error) {
      logger.error('Error creating payment method:', error);
      res.status(500).json({ error: 'Failed to create payment method', details: error.message });
    }
  });

  app.put('/api/admin/payment-methods/:id', auth, adminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const paymentMethodData = req.body;

      if (!paymentMethodData.name || !paymentMethodData.code) {
        return res.status(400).json({ error: 'Name and code are required' });
      }

      if (req.user.role !== 'superadmin') {
        const userWithCafe = await User.findByIdWithCafe(req.user.id);
        if (userWithCafe && userWithCafe.cafe_id) {
          const existing = await PaymentMethod.getById(id, userWithCafe.cafe_id);
          if (!existing) {
            return res.status(403).json({ error: 'Payment method not found or access denied' });
          }
        } else {
          return res.status(403).json({ error: 'User must belong to a cafe' });
        }
      }

      const updatedPaymentMethod = await PaymentMethod.update(id, paymentMethodData);
      res.json(updatedPaymentMethod);
    } catch (error) {
      logger.error('Error updating payment method:', error);
      res.status(500).json({ error: 'Failed to update payment method', details: error.message });
    }
  });

  app.delete('/api/admin/payment-methods/:id', auth, adminAuth, async (req, res) => {
    try {
      const { id } = req.params;

      if (req.user.role !== 'superadmin') {
        const userWithCafe = await User.findByIdWithCafe(req.user.id);
        if (userWithCafe && userWithCafe.cafe_id) {
          const existing = await PaymentMethod.getById(id, userWithCafe.cafe_id);
          if (!existing) {
            return res.status(403).json({ error: 'Payment method not found or access denied' });
          }
        } else {
          return res.status(403).json({ error: 'User must belong to a cafe' });
        }
      }

      const result = await PaymentMethod.delete(id);
      res.json(result);
    } catch (error) {
      logger.error('Error deleting payment method:', error);
      res.status(500).json({ error: 'Failed to delete payment method', details: error.message });
    }
  });

  app.patch('/api/admin/payment-methods/:id/toggle', auth, adminAuth, async (req, res) => {
    try {
      const { id } = req.params;

      if (req.user.role !== 'superadmin') {
        const userWithCafe = await User.findByIdWithCafe(req.user.id);
        if (userWithCafe && userWithCafe.cafe_id) {
          const existing = await PaymentMethod.getById(id, userWithCafe.cafe_id);
          if (!existing) {
            return res.status(403).json({ error: 'Payment method not found or access denied' });
          }
        } else {
          return res.status(403).json({ error: 'User must belong to a cafe' });
        }
      }

      const updatedPaymentMethod = await PaymentMethod.toggleStatus(id);
      res.json(updatedPaymentMethod);
    } catch (error) {
      logger.error('Error toggling payment method status:', error);
      res.status(500).json({ error: 'Failed to toggle payment method status', details: error.message });
    }
  });

  app.post('/api/admin/payment-methods/reorder', auth, adminAuth, async (req, res) => {
    try {
      const { orderedIds } = req.body;

      if (!orderedIds || !Array.isArray(orderedIds)) {
        return res.status(400).json({ error: 'Ordered IDs array is required' });
      }

      if (req.user.role !== 'superadmin') {
        const userWithCafe = await User.findByIdWithCafe(req.user.id);
        if (userWithCafe && userWithCafe.cafe_id) {
          for (const id of orderedIds) {
            const existing = await PaymentMethod.getById(id, userWithCafe.cafe_id);
            if (!existing) {
              return res.status(403).json({ error: `Payment method ${id} not found or access denied` });
            }
          }
        } else {
          return res.status(403).json({ error: 'User must belong to a cafe' });
        }
      }

      const result = await PaymentMethod.reorder(orderedIds);
      res.json(result);
    } catch (error) {
      logger.error('Error reordering payment methods:', error);
      res.status(500).json({ error: 'Failed to reorder payment methods', details: error.message });
    }
  });
};
