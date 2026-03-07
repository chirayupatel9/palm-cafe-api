import { Application, Request, Response } from 'express';
import Customer from '../models/customer';
import Cafe from '../models/cafe';
import {
  getOrderCafeId,
  requireOrderCafeScope,
  isInvalidCustomerPhone,
  parseListLimitOffset
} from './helpers';
import {
  validateRequiredString,
  sanitizeString,
  isMalformedString,
  parsePositiveId
} from '../middleware/validateInput';
import { auth } from '../middleware/auth';
import logger from '../config/logger';
import * as otpStore from '../services/otpStore';
import * as emailService from '../services/emailService';

function validateEmail(value: unknown): string | null {
  const s = sanitizeString(value);
  if (!s) return 'Email is required';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(s)) return 'Please enter a valid email address';
  return null;
}

export default function registerCustomers(app: Application): void {
  app.get('/api/customers/statistics', auth, async (req: Request, res: Response) => {
    try {
      let cafeId: number | null = null;
      if (req.user) {
        if (req.impersonation && req.impersonation.isImpersonating) {
          cafeId = req.impersonation.cafeId ?? null;
        } else if (req.user.cafe_id) {
          cafeId = req.user.cafe_id;
        }
      }
      if (req.user && req.user.role === 'superadmin' && req.query.cafeId) {
        cafeId = parseInt(String(req.query.cafeId), 10);
      }
      const statistics = await Customer.getStatistics(cafeId);
      res.json(statistics);
    } catch (error) {
      logger.error('Error fetching customer statistics:', error as Error);
      res.status(500).json({ error: 'Failed to fetch customer statistics' });
    }
  });

  app.get('/api/customers', auth, async (req: Request, res: Response) => {
    try {
      let cafeId: number | null = null;
      if (req.user) {
        if (req.impersonation && req.impersonation.isImpersonating) {
          cafeId = req.impersonation.cafeId ?? null;
        } else if (req.user.cafe_id) {
          cafeId = req.user.cafe_id;
        }
      }
      if (req.user && req.user.role === 'superadmin' && req.query.cafeId) {
        cafeId = parseInt(String(req.query.cafeId), 10);
      }
      const { limit, offset } = parseListLimitOffset(req);
      const listOptions = limit != null ? { limit, offset } : {};
      const customers = await Customer.getAll(cafeId, listOptions);
      res.json(customers);
    } catch (error) {
      logger.error('Error fetching customers:', error as Error);
      res.status(500).json({ error: 'Failed to fetch customers' });
    }
  });

  app.get('/api/customers/:id', auth, requireOrderCafeScope, async (req: Request, res: Response) => {
    try {
      const cafeId = getOrderCafeId(req);
      const customerId = parsePositiveId(req.params.id);
      if (!customerId) {
        res.status(400).json({ error: 'Invalid customer ID' });
        return;
      }
      const customer = await Customer.getById(customerId, cafeId);
      if (!customer) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }
      res.json(customer);
    } catch (error) {
      logger.error('Error fetching customer:', error as Error);
      res.status(500).json({ error: 'Failed to fetch customer' });
    }
  });

  app.post('/api/customer/send-otp', async (req: Request, res: Response) => {
    try {
      const { email, cafeSlug } = req.body as { email?: string; cafeSlug?: string };
      const emailErr = validateEmail(email);
      if (emailErr) {
        res.status(400).json({ error: emailErr });
        return;
      }
      const slug = (sanitizeString(cafeSlug || (req.query.cafeSlug as string)) ?? '') || 'default';
      if (!emailService.isConfigured()) {
        res.status(503).json({
          error: 'Email service is not configured. Please try again later.'
        });
        return;
      }
      const emailVal = (sanitizeString(email) ?? '').toLowerCase();
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      otpStore.set(emailVal, slug, otp);

      const result = await emailService.sendOtpEmail(emailVal, otp);
      if (!result.sent) {
        res.status(500).json({ error: result.error || 'Failed to send verification email' });
        return;
      }
      res.json({ message: 'Verification code sent to your email' });
    } catch (error) {
      logger.error('Error sending OTP:', error as Error);
      res.status(500).json({ error: 'Failed to send verification code' });
    }
  });

  app.post('/api/customer/login', async (req: Request, res: Response) => {
    try {
      const { email, otp, cafeSlug } = req.body as { email?: string; otp?: string; cafeSlug?: string };
      const emailErr = validateEmail(email);
      if (emailErr) {
        res.status(400).json({ error: emailErr });
        return;
      }
      const otpErr = validateRequiredString(otp, 'Verification code');
      if (otpErr) {
        res.status(400).json({ error: otpErr });
        return;
      }

      let cafeId: number | null = null;
      const slug = sanitizeString(cafeSlug || (req.query.cafeSlug as string)) || 'default';
      try {
        const cafe = await Cafe.getBySlug(slug);
        if (cafe) cafeId = cafe.id;
      } catch {
        logger.warn('[POST /api/customer/login] Could not find cafe by slug:', slug);
      }

      const emailVal = (sanitizeString(email) ?? '').toLowerCase();
      const otpVal = String(otp).trim();
      if (!otpStore.verifyAndConsume(emailVal, slug, otpVal)) {
        res.status(400).json({ error: 'Invalid or expired verification code' });
        return;
      }

      const customer = await Customer.findByEmail(emailVal, cafeId);
      if (customer) {
        const sanitizedCustomer = {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          address: customer.address,
          date_of_birth: customer.date_of_birth,
          loyalty_points: customer.loyalty_points,
          total_spent: customer.total_spent,
          visit_count: customer.visit_count,
          first_visit_date: customer.first_visit_date,
          last_visit_date: customer.last_visit_date,
          is_active: customer.is_active,
          notes: customer.notes,
          created_at: customer.created_at,
          updated_at: customer.updated_at
        };
        res.json(sanitizedCustomer);
      } else {
        res.status(404).json({ error: 'Customer not found. Please register first.' });
      }
    } catch (error) {
      logger.error('Error during customer login:', error as Error);
      res.status(500).json({ error: 'Failed to find customer' });
    }
  });

  app.post('/api/customer/lookup', async (req: Request, res: Response) => {
    try {
      const { query, phone, email, cafeSlug } = req.body as {
        query?: string;
        phone?: string;
        email?: string;
        cafeSlug?: string;
      };
      const raw =
        query != null
          ? String(query).trim()
          : phone != null
            ? String(phone).trim()
            : email != null
              ? String(email).trim()
              : '';
      if (!raw) {
        res.status(400).json({ error: 'Phone number or email is required' });
        return;
      }

      let cafeId: number | null = null;
      const slug = sanitizeString(cafeSlug || (req.query.cafeSlug as string)) || 'default';
      try {
        const cafe = await Cafe.getBySlug(slug);
        if (cafe) cafeId = cafe.id;
      } catch {
        logger.warn('[POST /api/customer/lookup] Could not find cafe by slug:', slug);
      }

      const value = sanitizeString(raw) ?? '';
      const isEmail = value.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      let customer = null;
      if (isEmail) {
        customer = await Customer.findByEmail(value.toLowerCase(), cafeId);
        if (!customer) {
          customer = await Customer.findByEmailOrPhone(value.toLowerCase(), value, cafeId);
        }
      } else {
        customer = await Customer.findByEmailOrPhone('', value, cafeId);
      }
      if (customer) {
        const sanitizedCustomer = {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          address: customer.address,
          date_of_birth: customer.date_of_birth,
          loyalty_points: customer.loyalty_points,
          total_spent: customer.total_spent,
          visit_count: customer.visit_count,
          first_visit_date: customer.first_visit_date,
          last_visit_date: customer.last_visit_date,
          is_active: customer.is_active,
          notes: customer.notes,
          created_at: customer.created_at,
          updated_at: customer.updated_at
        };
        res.json(sanitizedCustomer);
      } else {
        res.status(404).json({ error: 'Customer not found' });
      }
    } catch (error) {
      logger.error('Error looking up customer:', error as Error);
      res.status(500).json({ error: 'Failed to find customer' });
    }
  });

  app.get('/api/customer/refresh', async (req: Request, res: Response) => {
    try {
      const customerId = parsePositiveId(req.query.customerId as string);
      const slug = sanitizeString(req.query.cafeSlug as string) || 'default';
      if (!customerId) {
        res.status(400).json({ error: 'Invalid customer ID' });
        return;
      }

      let cafeId: number | null = null;
      try {
        const cafe = await Cafe.getBySlug(slug);
        if (cafe) cafeId = cafe.id;
      } catch {
        // ignore
      }
      if (!cafeId) {
        res.status(400).json({ error: 'Invalid cafe' });
        return;
      }

      const customer = await Customer.getById(customerId, cafeId);
      if (!customer) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }
      const sanitizedCustomer = {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        date_of_birth: customer.date_of_birth,
        loyalty_points: customer.loyalty_points,
        total_spent: customer.total_spent,
        visit_count: customer.visit_count,
        first_visit_date: customer.first_visit_date,
        last_visit_date: customer.last_visit_date,
        is_active: customer.is_active,
        notes: customer.notes,
        created_at: customer.created_at,
        updated_at: customer.updated_at
      };
      res.json(sanitizedCustomer);
    } catch (error) {
      logger.error('Error refreshing customer:', error as Error);
      res.status(500).json({ error: 'Failed to refresh customer' });
    }
  });

  app.post('/api/customer/register', async (req: Request, res: Response) => {
    try {
      const {
        name,
        email,
        phone,
        address,
        date_of_birth,
        notes,
        cafeSlug
      } = req.body as {
        name?: string;
        email?: string;
        phone?: string;
        address?: string;
        date_of_birth?: string;
        notes?: string;
        cafeSlug?: string;
      };

      const nameErr = validateRequiredString(name, 'Customer name');
      if (nameErr) {
        res.status(400).json({ error: nameErr });
        return;
      }
      const emailErr = validateEmail(email);
      if (emailErr) {
        res.status(400).json({ error: emailErr });
        return;
      }
      const phoneErr = validateRequiredString(phone, 'Phone number');
      if (phoneErr) {
        res.status(400).json({ error: phoneErr });
        return;
      }

      let cafeId: number | null = null;
      const slug = sanitizeString(cafeSlug || (req.query.cafeSlug as string)) || 'default';
      try {
        const cafe = await Cafe.getBySlug(slug);
        if (cafe) cafeId = cafe.id;
      } catch {
        logger.warn('[POST /api/customer/register] Could not find cafe by slug:', slug);
      }

      if (!cafeId) {
        res.status(400).json({
          error: 'Unable to determine cafe. Please provide a valid cafe slug.'
        });
        return;
      }

      const customerData = {
        name: sanitizeString(name)!,
        email: (sanitizeString(email) ?? '').toLowerCase(),
        phone: sanitizeString(phone) ?? '',
        address: sanitizeString(address),
        date_of_birth:
          date_of_birth && !isMalformedString(date_of_birth) ? String(date_of_birth).trim() : null,
        notes: sanitizeString(notes),
        cafe_id: cafeId
      };

      const existingCustomer = await Customer.findByEmailOrPhone(
        customerData.email,
        customerData.phone,
        cafeId
      );
      if (existingCustomer) {
        res.status(400).json({ error: 'Customer with this email or phone already exists' });
        return;
      }

      const customer = await Customer.create(customerData);
      res.status(201).json(customer);
    } catch (error) {
      logger.error('Error creating customer:', error as Error);
      res.status(500).json({
        error: (error as Error).message || 'Failed to create customer'
      });
    }
  });

  app.put('/api/customer/profile', async (req: Request, res: Response) => {
    try {
      const { id, name, email, address, date_of_birth, cafeSlug } = req.body as {
        id?: unknown;
        name?: string;
        email?: string;
        address?: string;
        date_of_birth?: string;
        cafeSlug?: string;
      };

      const customerId = parsePositiveId(id);
      if (!customerId) {
        res.status(400).json({ error: 'Customer ID is required and must be a valid number' });
        return;
      }

      const nameErr = validateRequiredString(name, 'Customer name');
      if (nameErr) {
        res.status(400).json({ error: nameErr });
        return;
      }

      let cafeId: number | null = null;
      const slug = sanitizeString(cafeSlug || (req.query.cafeSlug as string)) || 'default';
      try {
        const cafe = await Cafe.getBySlug(slug);
        if (cafe) cafeId = cafe.id;
      } catch {
        // ignore
      }

      const existingCustomer = await Customer.getById(customerId, cafeId);
      if (!existingCustomer) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }

      const customerData = {
        name: sanitizeString(name)!,
        email: sanitizeString(email) || null,
        phone: existingCustomer.phone != null ? existingCustomer.phone : null,
        address: sanitizeString(address) || null,
        date_of_birth:
          date_of_birth && !isMalformedString(date_of_birth) ? String(date_of_birth).trim() : null,
        notes: existingCustomer.notes != null ? existingCustomer.notes : null,
        is_active: existingCustomer.is_active != null ? existingCustomer.is_active : true
      };

      const customer = await Customer.update(customerId, customerData, cafeId);

      const sanitizedCustomer = {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        address: customer.address,
        date_of_birth: customer.date_of_birth,
        loyalty_points: customer.loyalty_points,
        total_spent: customer.total_spent,
        visit_count: customer.visit_count,
        first_visit_date: customer.first_visit_date,
        last_visit_date: customer.last_visit_date,
        is_active: customer.is_active,
        notes: customer.notes,
        created_at: customer.created_at,
        updated_at: customer.updated_at
      };

      res.json(sanitizedCustomer);
    } catch (error) {
      logger.error('Error updating customer profile:', error as Error);
      res.status(500).json({ error: 'Failed to update customer profile' });
    }
  });

  app.get('/api/customers/search/:query', auth, async (req: Request, res: Response) => {
    try {
      const { query } = req.params;

      let cafeId: number | null = null;
      if (req.user) {
        if (req.impersonation && req.impersonation.isImpersonating) {
          cafeId = req.impersonation.cafeId ?? null;
        } else if (req.user.cafe_id) {
          cafeId = req.user.cafe_id;
        }
      }
      if (req.user && req.user.role === 'superadmin' && req.query.cafeId) {
        cafeId = parseInt(String(req.query.cafeId), 10);
      }

      const customers = await Customer.search(query, cafeId);
      res.json(customers);
    } catch (error) {
      logger.error('Error searching customers:', error as Error);
      res.status(500).json({ error: 'Failed to search customers' });
    }
  });

  app.post('/api/customers', auth, async (req: Request, res: Response) => {
    try {
      const { name, email, phone, address, date_of_birth, notes } = req.body as {
        name?: string;
        email?: string;
        phone?: string;
        address?: string;
        date_of_birth?: string;
        notes?: string;
      };

      if (!name) {
        res.status(400).json({ error: 'Customer name is required' });
        return;
      }

      let cafeId: number | null = null;
      if (req.user) {
        if (req.impersonation && req.impersonation.isImpersonating) {
          cafeId = req.impersonation.cafeId ?? null;
        } else if (req.user.cafe_id) {
          cafeId = req.user.cafe_id;
        }
      }

      if (!cafeId) {
        res.status(400).json({
          error: 'Unable to determine cafe. Please ensure you are logged in and belong to a cafe.'
        });
        return;
      }

      const customerData = {
        name: name.trim(),
        email: email ? email.trim() : null,
        phone: phone ? phone.trim() : null,
        address: address ? address.trim() : null,
        date_of_birth: date_of_birth || null,
        notes: notes ? notes.trim() : null,
        cafe_id: cafeId
      };

      const customer = await Customer.create(customerData);
      res.status(201).json(customer);
    } catch (error) {
      logger.error('Error creating customer:', error as Error);
      res.status(500).json({
        error: (error as Error).message || 'Failed to create customer'
      });
    }
  });

  app.put('/api/customers/:id', auth, requireOrderCafeScope, async (req: Request, res: Response) => {
    try {
      const cafeId = getOrderCafeId(req);
      const customerId = parsePositiveId(req.params.id);
      if (!customerId) {
        res.status(400).json({ error: 'Invalid customer ID' });
        return;
      }
      const { name, email, phone, address, date_of_birth, notes, is_active } = req.body as {
        name?: string;
        email?: string;
        phone?: string;
        address?: string;
        date_of_birth?: string;
        notes?: string;
        is_active?: boolean;
      };

      const nameErr = validateRequiredString(name, 'Customer name');
      if (nameErr) {
        res.status(400).json({ error: nameErr });
        return;
      }

      const customerData = {
        name: sanitizeString(name)!,
        email: sanitizeString(email),
        phone: sanitizeString(phone),
        address: sanitizeString(address),
        date_of_birth:
          date_of_birth && !isMalformedString(date_of_birth) ? String(date_of_birth).trim() : null,
        notes: sanitizeString(notes),
        is_active: is_active !== undefined ? is_active : true
      };

      const customer = await Customer.update(customerId, customerData, cafeId);
      res.json(customer);
    } catch (error) {
      if ((error as Error).message === 'Customer not found') {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }
      logger.error('Error updating customer:', error as Error);
      res.status(500).json({ error: 'Failed to update customer' });
    }
  });

  app.get(
    '/api/customers/:id/orders',
    auth,
    requireOrderCafeScope,
    async (req: Request, res: Response) => {
      try {
        const cafeId = getOrderCafeId(req);
        const customerId = parsePositiveId(req.params.id);
        if (!customerId) {
          res.status(400).json({ error: 'Invalid customer ID' });
          return;
        }
        const orders = await Customer.getOrderHistory(customerId, cafeId);
        res.json(orders);
      } catch (error) {
        logger.error('Error fetching customer orders:', error as Error);
        res.status(500).json({ error: 'Failed to fetch customer orders' });
      }
    }
  );

  app.post(
    '/api/customers/:id/redeem-points',
    auth,
    requireOrderCafeScope,
    async (req: Request, res: Response) => {
      try {
        const cafeId = getOrderCafeId(req);
        const customerId = parsePositiveId(req.params.id);
        if (!customerId) {
          res.status(400).json({ error: 'Invalid customer ID' });
          return;
        }
        const { points } = req.body as { points?: number };

        if (!points || points <= 0) {
          res.status(400).json({ error: 'Valid points amount is required' });
          return;
        }

        const customer = await Customer.redeemPoints(customerId, points, cafeId);
        res.json(customer);
      } catch (error) {
        if (
          (error as Error).message === 'Customer not found' ||
          (error as Error).message === 'Insufficient loyalty points'
        ) {
          res.status(400).json({ error: (error as Error).message });
          return;
        }
        logger.error('Error redeeming points:', error as Error);
        res.status(500).json({ error: 'Failed to redeem points' });
      }
    }
  );
}
