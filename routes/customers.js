const Customer = require('../models/customer');
const Order = require('../models/order');
const Cafe = require('../models/cafe');
const { getOrderCafeId, requireOrderCafeScope, isInvalidCustomerPhone, parseListLimitOffset } = require('./helpers');
const { validateRequiredString, sanitizeString, isMalformedString, parsePositiveId } = require('../middleware/validateInput');
const { auth, adminAuth } = require('../middleware/auth');
const logger = require('../config/logger');

module.exports = function registerCustomers(app) {
app.get('/api/customers/statistics', auth, async (req, res) => {
  try {
    // Get cafe_id from authenticated user (handles impersonation too)
    let cafeId = null;
    if (req.user) {
      // Check if impersonating
      if (req.impersonation && req.impersonation.isImpersonating) {
        cafeId = req.impersonation.cafeId;
      } else if (req.user.cafe_id) {
        cafeId = req.user.cafe_id;
      }
    }
    
    // Super admin can optionally filter by cafe_id via query param
    if (req.user && req.user.role === 'superadmin' && req.query.cafeId) {
      cafeId = parseInt(req.query.cafeId, 10);
    }
    
    const statistics = await Customer.getStatistics(cafeId);
    res.json(statistics);
  } catch (error) {
    logger.error('Error fetching customer statistics:', error);
    res.status(500).json({ error: 'Failed to fetch customer statistics' });
  }
});

// Get all customers
app.get('/api/customers', auth, async (req, res) => {
  try {
    // Get cafe_id from authenticated user (handles impersonation too)
    let cafeId = null;
    if (req.user) {
      // Check if impersonating
      if (req.impersonation && req.impersonation.isImpersonating) {
        cafeId = req.impersonation.cafeId;
      } else if (req.user.cafe_id) {
        cafeId = req.user.cafe_id;
      }
    }
    
    // Super admin can optionally filter by cafe_id via query param
    if (req.user && req.user.role === 'superadmin' && req.query.cafeId) {
      cafeId = parseInt(req.query.cafeId, 10);
    }

    const { limit, offset } = parseListLimitOffset(req);
    const listOptions = limit != null ? { limit, offset } : {};
    const customers = await Customer.getAll(cafeId, listOptions);
    res.json(customers);
  } catch (error) {
    logger.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Get customer by ID (multi-cafe: scoped by cafe_id)
app.get('/api/customers/:id', auth, requireOrderCafeScope, async (req, res) => {
  try {
    const cafeId = getOrderCafeId(req);
    const customerId = parsePositiveId(req.params.id);
    if (!customerId) {
      return res.status(400).json({ error: 'Invalid customer ID' });
    }
    const customer = await Customer.getById(customerId, cafeId);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(customer);
  } catch (error) {
    logger.error('Error fetching customer:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// Public customer authentication endpoints (no auth required)
// Search customers by phone for login (POST with encrypted payload)
app.post('/api/customer/login', async (req, res) => {
  try {
    const { phone, cafeSlug } = req.body;
    
    const phoneErr = validateRequiredString(phone, 'Phone number');
    if (phoneErr) {
      return res.status(400).json({ error: phoneErr });
    }

    let cafeId = null;
    const slug = sanitizeString(cafeSlug || req.query.cafeSlug) || 'default';

    // Get cafe_id from cafe slug (for public customer login)
    try {
      const cafe = await Cafe.getBySlug(slug);
      if (cafe) {
        cafeId = cafe.id;
      }
    } catch (error) {
      logger.warn('[POST /api/customer/login] Could not find cafe by slug:', slug);
    }
    
    // Find customer scoped to this cafe
    const phoneVal = sanitizeString(phone);
    const customer = await Customer.findByEmailOrPhone(null, phoneVal, cafeId);
    
    if (customer) {
      // Return customer data; include phone so the client can fetch order history
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
    res.status(500).json({ error: 'Failed to find customer' });
  }
});

// Register new customer (public endpoint)
app.post('/api/customer/register', async (req, res) => {
  try {
    const { name, email, phone, address, date_of_birth, notes, cafeSlug } = req.body;

    const nameErr = validateRequiredString(name, 'Customer name');
    if (nameErr) {
      return res.status(400).json({ error: nameErr });
    }
    const phoneErr = validateRequiredString(phone, 'Phone number');
    if (phoneErr) {
      return res.status(400).json({ error: phoneErr });
    }

    let cafeId = null;
    const slug = sanitizeString(cafeSlug || req.query.cafeSlug) || 'default';

    // Get cafe_id from cafe slug (for public customer registration)
    try {
      const cafe = await Cafe.getBySlug(slug);
      if (cafe) {
        cafeId = cafe.id;
      }
    } catch (error) {
      logger.warn('[POST /api/customer/register] Could not find cafe by slug:', slug);
    }
    
    if (!cafeId) {
      return res.status(400).json({ 
        error: 'Unable to determine cafe. Please provide a valid cafe slug.' 
      });
    }

    const customerData = {
      name: sanitizeString(name),
      email: sanitizeString(email),
      phone: sanitizeString(phone),
      address: sanitizeString(address),
      date_of_birth: date_of_birth && !isMalformedString(date_of_birth) ? String(date_of_birth).trim() : null,
      notes: sanitizeString(notes),
      cafe_id: cafeId
    };

    // Check if customer already exists (scoped to this cafe)
    const existingCustomer = await Customer.findByEmailOrPhone(customerData.email, customerData.phone, cafeId);
    if (existingCustomer) {
      return res.status(400).json({ error: 'Customer with this phone number already exists' });
    }

    const customer = await Customer.create(customerData);
    res.status(201).json(customer);
  } catch (error) {
    logger.error('Error creating customer:', error);
    res.status(500).json({ error: error.message || 'Failed to create customer' });
  }
});

// Update customer profile (public endpoint - customers can update their own details; scope by cafeSlug for multi-cafe)
app.put('/api/customer/profile', async (req, res) => {
  try {
    const { id, name, email, address, date_of_birth, cafeSlug } = req.body;

    const customerId = parsePositiveId(id);
    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required and must be a valid number' });
    }

    const nameErr = validateRequiredString(name, 'Customer name');
    if (nameErr) {
      return res.status(400).json({ error: nameErr });
    }

    let cafeId = null;
    const slug = sanitizeString(cafeSlug || req.query.cafeSlug) || 'default';
    try {
      const cafe = await Cafe.getBySlug(slug);
      if (cafe) cafeId = cafe.id;
    } catch (e) {
      // ignore
    }

    const existingCustomer = await Customer.getById(customerId, cafeId);
    if (!existingCustomer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customerData = {
      name: sanitizeString(name),
      email: sanitizeString(email),
      address: sanitizeString(address),
      date_of_birth: date_of_birth && !isMalformedString(date_of_birth) ? String(date_of_birth).trim() : null
    };

    const customer = await Customer.update(customerId, customerData, cafeId);
    
    // Return sanitized customer data (without phone in response for security)
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
    logger.error('Error updating customer profile:', error);
    res.status(500).json({ error: 'Failed to update customer profile' });
  }
});

// Search customers (admin only)
app.get('/api/customers/search/:query', auth, async (req, res) => {
  try {
    const { query } = req.params;
    
    // Get cafe_id from authenticated user (handles impersonation too)
    let cafeId = null;
    if (req.user) {
      // Check if impersonating
      if (req.impersonation && req.impersonation.isImpersonating) {
        cafeId = req.impersonation.cafeId;
      } else if (req.user.cafe_id) {
        cafeId = req.user.cafe_id;
      }
    }
    
    // Super admin can optionally filter by cafe_id via query param
    if (req.user && req.user.role === 'superadmin' && req.query.cafeId) {
      cafeId = parseInt(req.query.cafeId, 10);
    }
    
    const customers = await Customer.search(query, cafeId);
    res.json(customers);
  } catch (error) {
    logger.error('Error searching customers:', error);
    res.status(500).json({ error: 'Failed to search customers' });
  }
});

// Create new customer (admin only)
app.post('/api/customers', auth, async (req, res) => {
  try {
    const { name, email, phone, address, date_of_birth, notes } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    // Get cafe_id from authenticated user (handles impersonation too)
    let cafeId = null;
    if (req.user) {
      // Check if impersonating
      if (req.impersonation && req.impersonation.isImpersonating) {
        cafeId = req.impersonation.cafeId;
      } else if (req.user.cafe_id) {
        cafeId = req.user.cafe_id;
      }
    }
    
    if (!cafeId) {
      return res.status(400).json({ 
        error: 'Unable to determine cafe. Please ensure you are logged in and belong to a cafe.' 
      });
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
    logger.error('Error creating customer:', error);
    res.status(500).json({ error: error.message || 'Failed to create customer' });
  }
});

// Update customer (multi-cafe: scoped by cafe_id)
app.put('/api/customers/:id', auth, requireOrderCafeScope, async (req, res) => {
  try {
    const cafeId = getOrderCafeId(req);
    const customerId = parsePositiveId(req.params.id);
    if (!customerId) {
      return res.status(400).json({ error: 'Invalid customer ID' });
    }
    const { name, email, phone, address, date_of_birth, notes, is_active } = req.body;

    const nameErr = validateRequiredString(name, 'Customer name');
    if (nameErr) {
      return res.status(400).json({ error: nameErr });
    }

    const customerData = {
      name: sanitizeString(name),
      email: sanitizeString(email),
      phone: sanitizeString(phone),
      address: sanitizeString(address),
      date_of_birth: date_of_birth && !isMalformedString(date_of_birth) ? String(date_of_birth).trim() : null,
      notes: sanitizeString(notes),
      is_active: is_active !== undefined ? is_active : true
    };

    const customer = await Customer.update(customerId, customerData, cafeId);
    res.json(customer);
  } catch (error) {
    if (error.message === 'Customer not found') {
      return res.status(404).json({ error: 'Customer not found' });
    }
    logger.error('Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// Get customer order history (multi-cafe: scoped by cafe_id)
app.get('/api/customers/:id/orders', auth, requireOrderCafeScope, async (req, res) => {
  try {
    const cafeId = getOrderCafeId(req);
    const customerId = parsePositiveId(req.params.id);
    if (!customerId) {
      return res.status(400).json({ error: 'Invalid customer ID' });
    }
    const orders = await Customer.getOrderHistory(customerId, cafeId);
    res.json(orders);
  } catch (error) {
    logger.error('Error fetching customer orders:', error);
    res.status(500).json({ error: 'Failed to fetch customer orders' });
  }
});


// Redeem loyalty points (multi-cafe: scoped by cafe_id)
app.post('/api/customers/:id/redeem-points', auth, requireOrderCafeScope, async (req, res) => {
  try {
    const cafeId = getOrderCafeId(req);
    const customerId = parsePositiveId(req.params.id);
    if (!customerId) {
      return res.status(400).json({ error: 'Invalid customer ID' });
    }
    const { points } = req.body;

    if (!points || points <= 0) {
      return res.status(400).json({ error: 'Valid points amount is required' });
    }

    const customer = await Customer.redeemPoints(customerId, points, cafeId);
    res.json(customer);
  } catch (error) {
    if (error.message === 'Customer not found' || error.message === 'Insufficient loyalty points') {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Error redeeming points:', error);
    res.status(500).json({ error: 'Failed to redeem points' });
  }
});
};
