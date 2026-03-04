import { Application, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/user';
import Cafe from '../models/cafe';
import PaymentMethod from '../models/paymentMethod';
import { auth, adminAuth, JWT_SECRET } from '../middleware/auth';
import logger from '../config/logger';

export default function registerPaymentMethods(app: Application): void {
  app.get('/api/payment-methods', async (req: Request, res: Response) => {
    try {
      let cafeId: number | null = null;

      const token = req.header('Authorization')?.replace('Bearer ', '');
      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET, { clockTolerance: 600 }) as { userId?: number };
          if (decoded.userId) {
            const user = await User.findById(decoded.userId);
            if (user) {
              const userWithCafe = await User.findByIdWithCafe(user.id);
              if (userWithCafe && userWithCafe.cafe_id) {
                cafeId = userWithCafe.cafe_id;
              }
            }
          }
        } catch {
          // Token invalid or expired
        }
      }

      if (!cafeId) {
        const cafeSlug = (req.query.cafeSlug as string) || 'default';
        try {
          const cafe = await Cafe.getBySlug(cafeSlug);
          if (cafe) {
            cafeId = cafe.id;
          }
        } catch {
          // Cafe might not exist
        }
      }

      const paymentMethods = await PaymentMethod.getAll(cafeId);
      res.json(paymentMethods);
    } catch (error) {
      logger.error('Error fetching payment methods:', error as Error);
      res.status(500).json({ error: 'Failed to fetch payment methods' });
    }
  });

  app.get('/api/admin/payment-methods', auth, adminAuth, async (req: Request, res: Response) => {
    try {
      let cafeId: number | null = null;

      if (req.user && req.user.role !== 'superadmin') {
        const userWithCafe = await User.findByIdWithCafe(req.user.id);
        if (userWithCafe && userWithCafe.cafe_id) {
          cafeId = userWithCafe.cafe_id;
        }
      }

      const paymentMethods = await PaymentMethod.getAllForAdmin(cafeId);
      res.json(paymentMethods);
    } catch (error) {
      logger.error('Error fetching payment methods:', error as Error);
      res.status(500).json({ error: 'Failed to fetch payment methods' });
    }
  });

  app.post('/api/admin/payment-methods', auth, adminAuth, async (req: Request, res: Response) => {
    try {
      const paymentMethodData = req.body as { name?: string; code?: string; cafe_id?: number; description?: string | null; icon?: string | null; display_order?: number; is_active?: boolean };

      if (!paymentMethodData.name || !paymentMethodData.code) {
        res.status(400).json({ error: 'Name and code are required' });
        return;
      }

      if (req.user && req.user.role !== 'superadmin') {
        const userWithCafe = await User.findByIdWithCafe(req.user.id);
        if (userWithCafe && userWithCafe.cafe_id) {
          paymentMethodData.cafe_id = userWithCafe.cafe_id;
        } else {
          res.status(403).json({ error: 'User must belong to a cafe' });
          return;
        }
      }

      const newPaymentMethod = await PaymentMethod.create({
        name: paymentMethodData.name!,
        code: paymentMethodData.code!,
        description: paymentMethodData.description,
        icon: paymentMethodData.icon,
        display_order: paymentMethodData.display_order,
        is_active: paymentMethodData.is_active,
        cafe_id: paymentMethodData.cafe_id
      });
      res.status(201).json(newPaymentMethod);
    } catch (error) {
      logger.error('Error creating payment method:', error as Error);
      res.status(500).json({
        error: 'Failed to create payment method',
        details: (error as Error).message
      });
    }
  });

  app.put('/api/admin/payment-methods/:id', auth, adminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid payment method ID' });
        return;
      }
      const paymentMethodData = req.body as { name?: string; code?: string };

      if (!paymentMethodData.name || !paymentMethodData.code) {
        res.status(400).json({ error: 'Name and code are required' });
        return;
      }

      let cafeId: number | null = null;
      if (req.user && req.user.role !== 'superadmin') {
        const userWithCafe = await User.findByIdWithCafe(req.user.id);
        if (userWithCafe && userWithCafe.cafe_id) {
          cafeId = userWithCafe.cafe_id;
          const existing = await PaymentMethod.getById(id, cafeId);
          if (!existing) {
            res.status(403).json({ error: 'Payment method not found or access denied' });
            return;
          }
        } else {
          res.status(403).json({ error: 'User must belong to a cafe' });
          return;
        }
      } else {
        const existing = await PaymentMethod.getById(id, null);
        if (!existing) {
          res.status(404).json({ error: 'Payment method not found' });
          return;
        }
        cafeId = (existing as { cafe_id?: number | null }).cafe_id ?? null;
      }

      const updatedPaymentMethod = await PaymentMethod.update(id, cafeId, paymentMethodData);
      res.json(updatedPaymentMethod);
    } catch (error) {
      logger.error('Error updating payment method:', error as Error);
      res.status(500).json({
        error: 'Failed to update payment method',
        details: (error as Error).message
      });
    }
  });

  app.delete('/api/admin/payment-methods/:id', auth, adminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid payment method ID' });
        return;
      }

      let cafeId: number | null = null;
      if (req.user && req.user.role !== 'superadmin') {
        const userWithCafe = await User.findByIdWithCafe(req.user.id);
        if (userWithCafe && userWithCafe.cafe_id) {
          cafeId = userWithCafe.cafe_id;
          const existing = await PaymentMethod.getById(id, cafeId);
          if (!existing) {
            res.status(403).json({ error: 'Payment method not found or access denied' });
            return;
          }
        } else {
          res.status(403).json({ error: 'User must belong to a cafe' });
          return;
        }
      } else {
        const existing = await PaymentMethod.getById(id, null);
        if (!existing) {
          res.status(404).json({ error: 'Payment method not found' });
          return;
        }
        cafeId = (existing as { cafe_id?: number | null }).cafe_id ?? null;
      }

      const result = await PaymentMethod.delete(id, cafeId);
      res.json(result);
    } catch (error) {
      logger.error('Error deleting payment method:', error as Error);
      res.status(500).json({
        error: 'Failed to delete payment method',
        details: (error as Error).message
      });
    }
  });

  app.patch('/api/admin/payment-methods/:id/toggle', auth, adminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid payment method ID' });
        return;
      }

      let cafeId: number | null = null;
      if (req.user && req.user.role !== 'superadmin') {
        const userWithCafe = await User.findByIdWithCafe(req.user.id);
        if (userWithCafe && userWithCafe.cafe_id) {
          cafeId = userWithCafe.cafe_id;
          const existing = await PaymentMethod.getById(id, cafeId);
          if (!existing) {
            res.status(403).json({ error: 'Payment method not found or access denied' });
            return;
          }
        } else {
          res.status(403).json({ error: 'User must belong to a cafe' });
          return;
        }
      } else {
        const existing = await PaymentMethod.getById(id, null);
        if (!existing) {
          res.status(404).json({ error: 'Payment method not found' });
          return;
        }
        cafeId = (existing as { cafe_id?: number | null }).cafe_id ?? null;
      }

      const updatedPaymentMethod = await PaymentMethod.toggleStatus(id, cafeId);
      res.json(updatedPaymentMethod);
    } catch (error) {
      logger.error('Error toggling payment method status:', error as Error);
      res.status(500).json({
        error: 'Failed to toggle payment method status',
        details: (error as Error).message
      });
    }
  });

  app.post('/api/admin/payment-methods/reorder', auth, adminAuth, async (req: Request, res: Response) => {
    try {
      const { orderedIds } = req.body as { orderedIds?: string[] };

      if (!orderedIds || !Array.isArray(orderedIds)) {
        res.status(400).json({ error: 'Ordered IDs array is required' });
        return;
      }

      let cafeId: number | null = null;
      if (req.user && req.user.role !== 'superadmin') {
        const userWithCafe = await User.findByIdWithCafe(req.user.id);
        if (userWithCafe && userWithCafe.cafe_id) {
          cafeId = userWithCafe.cafe_id;
          for (const id of orderedIds) {
            const existing = await PaymentMethod.getById(parseInt(id, 10), cafeId);
            if (!existing) {
              res.status(403).json({ error: `Payment method ${id} not found or access denied` });
              return;
            }
          }
        } else {
          res.status(403).json({ error: 'User must belong to a cafe' });
          return;
        }
      } else {
        if (orderedIds.length === 0) {
          res.status(400).json({ error: 'Ordered IDs array is required' });
          return;
        }
        const existing = await PaymentMethod.getById(parseInt(orderedIds[0], 10), null);
        if (!existing) {
          res.status(403).json({ error: 'Payment method not found or access denied' });
          return;
        }
        cafeId = (existing as { cafe_id?: number | null }).cafe_id ?? null;
      }

      const orderedIdsNum = orderedIds.map((x: string) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
      const result = await PaymentMethod.reorder(cafeId, orderedIdsNum);
      res.json(result);
    } catch (error) {
      logger.error('Error reordering payment methods:', error as Error);
      res.status(500).json({
        error: 'Failed to reorder payment methods',
        details: (error as Error).message
      });
    }
  });
}
