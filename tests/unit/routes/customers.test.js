/**
 * Unit tests for routes/customers.js. Customer, Cafe, auth, helpers mocked.
 */
jest.mock('../../../models/customer');
jest.mock('../../../models/cafe');
jest.mock('../../../middleware/auth', () => ({ auth: (req, res, next) => next(), adminAuth: (req, res, next) => next() }));
jest.mock('../../../routes/helpers', () => ({
  getOrderCafeId: jest.fn(),
  requireOrderCafeScope: (req, res, next) => next(),
  parseListLimitOffset: jest.fn().mockReturnValue({ limit: null, offset: 0 }),
  isInvalidCustomerPhone: jest.fn()
}));
jest.mock('../../../middleware/validateInput', () => ({
  validateRequiredString: jest.fn(),
  sanitizeString: jest.fn((v) => (v != null && v !== 'undefined' ? String(v).trim() : null)),
  isMalformedString: jest.fn().mockReturnValue(false),
  parsePositiveId: jest.fn()
}));
jest.mock('../../../config/logger', () => ({ error: jest.fn(), warn: jest.fn() }));

const helpers = require('../../../routes/helpers');
const { getOrderCafeId, parseListLimitOffset } = helpers;
const { validateRequiredString, parsePositiveId, sanitizeString } = require('../../../middleware/validateInput');
const Customer = require('../../../models/customer');
const Cafe = require('../../../models/cafe');

const routes = {};
const mockApp = {
  get: (path, ...fns) => { routes[`GET ${path}`] = fns; },
  post: (path, ...fns) => { routes[`POST ${path}`] = fns; },
  put: (path, ...fns) => { routes[`PUT ${path}`] = fns; }
};
require('../../../routes/customers')(mockApp);

function getHandler(method, path) {
  const stack = routes[`${method} ${path}`];
  return stack ? stack[stack.length - 1] : null;
}

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

describe('routes/customers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOrderCafeId.mockReturnValue(1);
    parsePositiveId.mockReturnValue(1);
    validateRequiredString.mockReturnValue(null);
    parseListLimitOffset.mockReturnValue({ limit: null, offset: 0 });
  });

  describe('GET /api/customers/statistics', () => {
    const handler = getHandler('GET', '/api/customers/statistics');
    it('returns 200 with statistics', async () => {
      Customer.getStatistics.mockResolvedValue({ totalCustomers: 5, activeCustomers: 4, totalLoyaltyPoints: 100, totalSpent: 500, averageSpent: 100, topCustomers: [] });
      const req = { user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(Customer.getStatistics).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ totalCustomers: 5 }));
    });
    it('uses impersonation cafeId when impersonating', async () => {
      Customer.getStatistics.mockResolvedValue({ totalCustomers: 2 });
      const req = { user: { cafe_id: 1 }, impersonation: { isImpersonating: true, cafeId: 2 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(Customer.getStatistics).toHaveBeenCalledWith(2);
    });
    it('uses superadmin query.cafeId when provided', async () => {
      Customer.getStatistics.mockResolvedValue({ totalCustomers: 3 });
      const req = { user: { role: 'superadmin' }, query: { cafeId: '2' } };
      const res = mockRes();
      await handler(req, res);
      expect(Customer.getStatistics).toHaveBeenCalledWith(2);
    });
    it('returns 500 on error', async () => {
      Customer.getStatistics.mockRejectedValue(new Error('db'));
      const req = { user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch customer statistics' });
    });
  });

  describe('GET /api/customers', () => {
    const handler = getHandler('GET', '/api/customers');
    it('returns 200 with customer list', async () => {
      Customer.getAll.mockResolvedValue([{ id: 1, name: 'A' }]);
      parseListLimitOffset.mockReturnValue({ limit: 10, offset: 0 });
      const req = { user: { cafe_id: 1 }, query: { limit: '10' } };
      const res = mockRes();
      await handler(req, res);
      expect(Customer.getAll).toHaveBeenCalledWith(1, { limit: 10, offset: 0 });
      expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'A' }]);
    });
    it('returns 500 on error', async () => {
      Customer.getAll.mockRejectedValue(new Error('db'));
      const req = { user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch customers' });
    });
  });

  describe('GET /api/customers/:id', () => {
    const handler = getHandler('GET', '/api/customers/:id');
    it('returns 400 when customer ID invalid', async () => {
      parsePositiveId.mockReturnValue(null);
      const req = { params: { id: 'x' }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid customer ID' });
    });
    it('returns 404 when customer not found', async () => {
      parsePositiveId.mockReturnValue(999);
      Customer.getById.mockResolvedValue(null);
      const req = { params: { id: '999' }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Customer not found' });
    });
    it('returns 200 with customer', async () => {
      Customer.getById.mockResolvedValue({ id: 1, name: 'Alice' });
      const req = { params: { id: '1' }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ id: 1, name: 'Alice' });
    });
    it('returns 500 on error', async () => {
      Customer.getById.mockRejectedValue(new Error('db'));
      const req = { params: { id: '1' }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch customer' });
    });
  });

  describe('POST /api/customer/login', () => {
    const handler = getHandler('POST', '/api/customer/login');
    it('returns 400 when phone missing', async () => {
      validateRequiredString.mockReturnValue('Phone number is required and must be a valid value');
      const req = { body: { phone: '' }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Phone number is required and must be a valid value' });
    });
    it('continues when Cafe.getBySlug throws (catch branch)', async () => {
      Cafe.getBySlug.mockRejectedValue(new Error('db'));
      Customer.findByEmailOrPhone.mockResolvedValue(null);
      const req = { body: { phone: '+123' }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it('returns 404 when customer not found', async () => {
      Cafe.getBySlug.mockResolvedValue({ id: 1 });
      Customer.findByEmailOrPhone.mockResolvedValue(null);
      const req = { body: { phone: '+123' }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Customer not found' });
    });
    it('returns 200 with sanitized customer', async () => {
      Cafe.getBySlug.mockResolvedValue({ id: 1 });
      Customer.findByEmailOrPhone.mockResolvedValue({ id: 1, name: 'Bob', email: 'b@b.com', phone: '+123', address: null, date_of_birth: null, loyalty_points: 0, total_spent: 0, visit_count: 0, first_visit_date: null, last_visit_date: null, is_active: true, notes: null, created_at: null, updated_at: null });
      const req = { body: { phone: '+123' }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: 'Bob', phone: '+123' }));
    });
    it('returns 500 on error', async () => {
      Customer.findByEmailOrPhone.mockRejectedValue(new Error('db'));
      const req = { body: { phone: '+123' }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to find customer' });
    });
  });

  describe('POST /api/customer/register', () => {
    const handler = getHandler('POST', '/api/customer/register');
    it('returns 400 when name missing', async () => {
      validateRequiredString.mockImplementation((val, name) => (name === 'Customer name' ? 'Customer name is required and must be a valid value' : null));
      const req = { body: { name: '', phone: '+123' }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 400 when phone missing', async () => {
      validateRequiredString.mockImplementation((val, name) => (name === 'Phone number' ? 'Phone number is required' : null));
      const req = { body: { name: 'C', phone: '' }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 400 when cafe not found', async () => {
      Cafe.getBySlug.mockResolvedValue(null);
      const req = { body: { name: 'C', phone: '+123' }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unable to determine cafe. Please provide a valid cafe slug.' });
    });
    it('returns 400 when Cafe.getBySlug throws (catch branch)', async () => {
      Cafe.getBySlug.mockRejectedValue(new Error('db'));
      const req = { body: { name: 'C', phone: '+123' }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unable to determine cafe. Please provide a valid cafe slug.' });
    });
    it('returns 400 when duplicate customer (phone exists)', async () => {
      Cafe.getBySlug.mockResolvedValue({ id: 1 });
      Customer.findByEmailOrPhone.mockResolvedValue({ id: 1 });
      const req = { body: { name: 'C', phone: '+123' }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Customer with this phone number already exists' });
    });
    it('returns 201 with customer on success', async () => {
      Cafe.getBySlug.mockResolvedValue({ id: 1 });
      Customer.findByEmailOrPhone.mockResolvedValue(null);
      Customer.create.mockResolvedValue({ id: 10, name: 'C', phone: '+123' });
      const req = { body: { name: 'C', phone: '+123' }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(Customer.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: 10, name: 'C', phone: '+123' });
    });
    it('returns 500 on create error', async () => {
      Cafe.getBySlug.mockResolvedValue({ id: 1 });
      Customer.findByEmailOrPhone.mockResolvedValue(null);
      Customer.create.mockRejectedValue(new Error('db'));
      const req = { body: { name: 'C', phone: '+123' }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    });
  });

  describe('PUT /api/customer/profile', () => {
    const handler = getHandler('PUT', '/api/customer/profile');
    it('returns 400 when id invalid', async () => {
      parsePositiveId.mockReturnValue(null);
      const req = { body: { id: 'x', name: 'D' }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Customer ID is required and must be a valid number' });
    });
    it('returns 400 when name missing', async () => {
      validateRequiredString.mockReturnValue('Customer name is required and must be a valid value');
      const req = { body: { id: '1', name: '' }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 404 when customer not found', async () => {
      Cafe.getBySlug.mockResolvedValue({ id: 1 });
      Customer.getById.mockResolvedValue(null);
      const req = { body: { id: '1', name: 'D', email: null, address: null, date_of_birth: null }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Customer not found' });
    });
    it('returns 200 with sanitized customer', async () => {
      Cafe.getBySlug.mockResolvedValue({ id: 1 });
      Customer.getById.mockResolvedValue({ id: 1, name: 'D' });
      Customer.update.mockResolvedValue({ id: 1, name: 'D', email: null, address: null, date_of_birth: null, loyalty_points: 0, total_spent: 0, visit_count: 0, first_visit_date: null, last_visit_date: null, is_active: true, notes: null, created_at: null, updated_at: null });
      const req = { body: { id: '1', name: 'D', email: null, address: null, date_of_birth: null }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: 'D' }));
    });
    it('returns 500 on error', async () => {
      Customer.getById.mockRejectedValue(new Error('db'));
      const req = { body: { id: '1', name: 'D' }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update customer profile' });
    });
  });

  describe('GET /api/customers/search/:query', () => {
    const handler = getHandler('GET', '/api/customers/search/:query');
    it('returns 200 with search results', async () => {
      Customer.search.mockResolvedValue([{ id: 1, name: 'Alice' }]);
      const req = { params: { query: 'alice' }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(Customer.search).toHaveBeenCalledWith('alice', 1);
      expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Alice' }]);
    });
    it('returns 500 on error', async () => {
      Customer.search.mockRejectedValue(new Error('db'));
      const req = { params: { query: 'x' }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to search customers' });
    });
  });

  describe('POST /api/customers', () => {
    const handler = getHandler('POST', '/api/customers');
    it('returns 400 when name missing', async () => {
      const req = { body: { name: '' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Customer name is required' });
    });
    it('returns 400 when no cafeId (unauthorized / not assigned to cafe)', async () => {
      const req = { body: { name: 'E' }, user: { role: 'user' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unable to determine cafe. Please ensure you are logged in and belong to a cafe.' });
    });
    it('returns 201 with customer on success', async () => {
      Customer.create.mockResolvedValue({ id: 20, name: 'E', cafe_id: 1 });
      const req = { body: { name: 'E', email: 'e@e.com', phone: '+1' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(Customer.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'E', cafe_id: 1 }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: 20, name: 'E', cafe_id: 1 });
    });
    it('uses impersonation cafeId when impersonating', async () => {
      Customer.create.mockResolvedValue({ id: 21, name: 'E2', cafe_id: 2 });
      const req = { body: { name: 'E2' }, user: { cafe_id: 1 }, impersonation: { isImpersonating: true, cafeId: 2 } };
      const res = mockRes();
      await handler(req, res);
      expect(Customer.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'E2', cafe_id: 2 }));
      expect(res.status).toHaveBeenCalledWith(201);
    });
    it('returns 500 on create error', async () => {
      Customer.create.mockRejectedValue(new Error('db'));
      const req = { body: { name: 'E' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: expect.any(String) });
    });
  });

  describe('PUT /api/customers/:id', () => {
    const handler = getHandler('PUT', '/api/customers/:id');
    it('returns 400 when customer ID invalid', async () => {
      parsePositiveId.mockReturnValue(null);
      const req = { params: { id: 'x' }, body: { name: 'F' }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid customer ID' });
    });
    it('returns 400 when name missing', async () => {
      validateRequiredString.mockReturnValue('Customer name is required and must be a valid value');
      const req = { params: { id: '1' }, body: { name: '' }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 404 when customer not found', async () => {
      Customer.update.mockRejectedValue(new Error('Customer not found'));
      const req = { params: { id: '999' }, body: { name: 'F', email: null, phone: null, address: null, date_of_birth: null, notes: null }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Customer not found' });
    });
    it('returns 200 with customer on success', async () => {
      Customer.update.mockResolvedValue({ id: 1, name: 'F' });
      const req = { params: { id: '1' }, body: { name: 'F', email: null, phone: null, address: null, date_of_birth: null, notes: null }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ id: 1, name: 'F' });
    });
    it('returns 500 on internal error', async () => {
      Customer.update.mockRejectedValue(new Error('db'));
      const req = { params: { id: '1' }, body: { name: 'F' }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update customer' });
    });
  });

  describe('GET /api/customers/:id/orders', () => {
    const handler = getHandler('GET', '/api/customers/:id/orders');
    it('returns 400 when customer ID invalid', async () => {
      parsePositiveId.mockReturnValue(null);
      const req = { params: { id: 'x' }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid customer ID' });
    });
    it('returns 200 with orders', async () => {
      Customer.getOrderHistory.mockResolvedValue([{ id: 1, order_number: 'ORD1' }]);
      const req = { params: { id: '1' }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(Customer.getOrderHistory).toHaveBeenCalledWith(1, 1);
      expect(res.json).toHaveBeenCalledWith([{ id: 1, order_number: 'ORD1' }]);
    });
    it('returns 500 on error', async () => {
      Customer.getOrderHistory.mockRejectedValue(new Error('db'));
      const req = { params: { id: '1' }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch customer orders' });
    });
  });

  describe('POST /api/customers/:id/redeem-points', () => {
    const handler = getHandler('POST', '/api/customers/:id/redeem-points');
    it('returns 400 when customer ID invalid', async () => {
      parsePositiveId.mockReturnValue(null);
      const req = { params: { id: 'x' }, body: { points: 10 }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid customer ID' });
    });
    it('returns 400 when points missing or invalid', async () => {
      const req = { params: { id: '1' }, body: { points: 0 }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Valid points amount is required' });
    });
    it('returns 400 when customer not found', async () => {
      Customer.redeemPoints.mockRejectedValue(new Error('Customer not found'));
      const req = { params: { id: '999' }, body: { points: 10 }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Customer not found' });
    });
    it('returns 400 when insufficient loyalty points', async () => {
      Customer.redeemPoints.mockRejectedValue(new Error('Insufficient loyalty points'));
      const req = { params: { id: '1' }, body: { points: 100 }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient loyalty points' });
    });
    it('returns 200 with customer on success', async () => {
      Customer.redeemPoints.mockResolvedValue({ id: 1, loyalty_points: 30 });
      const req = { params: { id: '1' }, body: { points: 20 }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ id: 1, loyalty_points: 30 });
    });
    it('returns 500 on internal error', async () => {
      Customer.redeemPoints.mockRejectedValue(new Error('db'));
      const req = { params: { id: '1' }, body: { points: 10 }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to redeem points' });
    });
  });
});
