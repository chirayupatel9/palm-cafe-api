/**
 * Unit tests for routes/paymentMethods.js handlers. Models and auth mocked.
 */
jest.mock('jsonwebtoken', () => ({ verify: jest.fn(), sign: jest.fn() }));
jest.mock('../../../models/user');
jest.mock('../../../models/cafe');
jest.mock('../../../models/paymentMethod');
jest.mock('../../../middleware/auth', () => ({
  auth: (req, res, next) => next(),
  adminAuth: (req, res, next) => next(),
  JWT_SECRET: 'test-secret'
}));
jest.mock('../../../config/logger', () => ({ error: jest.fn() }));

const jwt = require('jsonwebtoken');
const User = require('../../../models/user');
const Cafe = require('../../../models/cafe');
const PaymentMethod = require('../../../models/paymentMethod');

const routes = {};
const mockApp = {
  get: (path, ...fns) => { routes[`GET ${path}`] = fns; },
  post: (path, ...fns) => { routes[`POST ${path}`] = fns; },
  put: (path, ...fns) => { routes[`PUT ${path}`] = fns; },
  delete: (path, ...fns) => { routes[`DELETE ${path}`] = fns; },
  patch: (path, ...fns) => { routes[`PATCH ${path}`] = fns; }
};

require('../../../routes/paymentMethods')(mockApp);

function getHandler(method, path) {
  const stack = routes[`${method} ${path}`];
  return stack ? stack[stack.length - 1] : null;
}

function mockRes() {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  return res;
}

describe('routes/paymentMethods', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/payment-methods', () => {
    const handler = getHandler('GET', '/api/payment-methods');
    it('returns 200 with methods when no token and cafeSlug resolves', async () => {
      const req = { header: () => '', query: { cafeSlug: 'my-cafe' } };
      Cafe.getBySlug.mockResolvedValue({ id: 1 });
      PaymentMethod.getAll.mockResolvedValue([{ id: 1, name: 'Cash' }]);
      const res = mockRes();
      await handler(req, res);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Cash' }]);
      expect(PaymentMethod.getAll).toHaveBeenCalledWith(1);
    });
    it('uses default cafeSlug when not provided', async () => {
      const req = { header: () => '', query: {} };
      Cafe.getBySlug.mockResolvedValue({ id: 2 });
      PaymentMethod.getAll.mockResolvedValue([]);
      const res = mockRes();
      await handler(req, res);
      expect(Cafe.getBySlug).toHaveBeenCalledWith('default');
      expect(PaymentMethod.getAll).toHaveBeenCalledWith(2);
    });
    it('uses cafeId from token when valid', async () => {
      const req = { header: (h) => h === 'Authorization' ? 'Bearer token' : '', query: {} };
      jwt.verify.mockReturnValue({ userId: 10 });
      User.findById.mockResolvedValue({ id: 10 });
      User.findByIdWithCafe.mockResolvedValue({ id: 10, cafe_id: 5 });
      PaymentMethod.getAll.mockResolvedValue([{ id: 1 }]);
      const res = mockRes();
      await handler(req, res);
      expect(PaymentMethod.getAll).toHaveBeenCalledWith(5);
      expect(Cafe.getBySlug).not.toHaveBeenCalled();
    });
    it('falls back to cafeSlug when token invalid', async () => {
      const req = { header: (h) => h === 'Authorization' ? 'Bearer bad' : '', query: { cafeSlug: 'x' } };
      jwt.verify.mockImplementation(() => { throw new Error('invalid'); });
      Cafe.getBySlug.mockResolvedValue({ id: 3 });
      PaymentMethod.getAll.mockResolvedValue([]);
      const res = mockRes();
      await handler(req, res);
      expect(PaymentMethod.getAll).toHaveBeenCalledWith(3);
    });
    it('returns 200 with getAll(null) when no cafeId resolved', async () => {
      const req = { header: () => '', query: { cafeSlug: 'none' } };
      Cafe.getBySlug.mockResolvedValue(null);
      PaymentMethod.getAll.mockResolvedValue([{ id: 1 }]);
      const res = mockRes();
      await handler(req, res);
      expect(PaymentMethod.getAll).toHaveBeenCalledWith(null);
      expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
    });
    it('returns 500 on error', async () => {
      const req = { header: () => '', query: {} };
      Cafe.getBySlug.mockResolvedValue(null);
      PaymentMethod.getAll.mockRejectedValue(new Error('db'));
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch payment methods' });
    });
  });

  describe('GET /api/admin/payment-methods', () => {
    const handler = getHandler('GET', '/api/admin/payment-methods');
    it('returns 200 with getAllForAdmin(cafeId) for non-superadmin', async () => {
      const req = { user: { id: 1, role: 'admin' } };
      User.findByIdWithCafe.mockResolvedValue({ id: 1, cafe_id: 2 });
      PaymentMethod.getAllForAdmin.mockResolvedValue([{ id: 1 }]);
      const res = mockRes();
      await handler(req, res);
      expect(PaymentMethod.getAllForAdmin).toHaveBeenCalledWith(2);
      expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
    });
    it('returns 200 with getAllForAdmin(null) for superadmin', async () => {
      const req = { user: { id: 1, role: 'superadmin' } };
      PaymentMethod.getAllForAdmin.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const res = mockRes();
      await handler(req, res);
      expect(User.findByIdWithCafe).not.toHaveBeenCalled();
      expect(PaymentMethod.getAllForAdmin).toHaveBeenCalledWith(null);
      expect(res.json).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
    });
    it('returns 500 on error', async () => {
      const req = { user: { id: 1, role: 'admin' } };
      User.findByIdWithCafe.mockResolvedValue({ cafe_id: 1 });
      PaymentMethod.getAllForAdmin.mockRejectedValue(new Error('fail'));
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /api/admin/payment-methods', () => {
    const handler = getHandler('POST', '/api/admin/payment-methods');
    it('returns 400 when name or code missing', async () => {
      const req = { user: { id: 1, role: 'admin' }, body: { name: 'X' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Name and code are required' });
    });
    it('returns 403 when non-superadmin has no cafe', async () => {
      const req = { user: { id: 1, role: 'admin' }, body: { name: 'X', code: 'x' } };
      User.findByIdWithCafe.mockResolvedValue({ id: 1, cafe_id: null });
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'User must belong to a cafe' });
    });
    it('returns 201 with created method for cafe user', async () => {
      const req = { user: { id: 1, role: 'admin' }, body: { name: 'Card', code: 'card' } };
      User.findByIdWithCafe.mockResolvedValue({ id: 1, cafe_id: 2 });
      PaymentMethod.create.mockResolvedValue({ id: 10, name: 'Card', code: 'card' });
      const res = mockRes();
      await handler(req, res);
      expect(PaymentMethod.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Card', code: 'card', cafe_id: 2 }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: 10, name: 'Card', code: 'card' });
    });
    it('returns 201 for superadmin without cafe_id in body', async () => {
      const req = { user: { id: 1, role: 'superadmin' }, body: { name: 'Pay', code: 'pay' } };
      PaymentMethod.create.mockResolvedValue({ id: 11, name: 'Pay' });
      const res = mockRes();
      await handler(req, res);
      expect(PaymentMethod.create).toHaveBeenCalledWith({ name: 'Pay', code: 'pay' });
      expect(res.status).toHaveBeenCalledWith(201);
    });
    it('returns 500 on create error', async () => {
      const req = { user: { id: 1, role: 'superadmin' }, body: { name: 'X', code: 'x' } };
      PaymentMethod.create.mockRejectedValue(new Error('db'));
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Failed to create payment method' }));
    });
  });

  describe('PUT /api/admin/payment-methods/:id', () => {
    const handler = getHandler('PUT', '/api/admin/payment-methods/:id');
    it('returns 400 when name or code missing', async () => {
      const req = { user: { id: 1, role: 'admin' }, params: { id: '1' }, body: { code: 'x' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 403 when cafe user and method not found', async () => {
      const req = { user: { id: 1, role: 'admin' }, params: { id: '99' }, body: { name: 'X', code: 'x' } };
      User.findByIdWithCafe.mockResolvedValue({ id: 1, cafe_id: 2 });
      PaymentMethod.getById.mockResolvedValue(null);
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Payment method not found or access denied' });
    });
    it('returns 403 when cafe user has no cafe', async () => {
      const req = { user: { id: 1, role: 'admin' }, params: { id: '1' }, body: { name: 'X', code: 'x' } };
      User.findByIdWithCafe.mockResolvedValue({ id: 1, cafe_id: null });
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'User must belong to a cafe' });
    });
    it('returns 404 when superadmin and method not found', async () => {
      const req = { user: { id: 1, role: 'superadmin' }, params: { id: '99' }, body: { name: 'X', code: 'x' } };
      PaymentMethod.getById.mockResolvedValue(null);
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Payment method not found' });
    });
    it('returns 200 with updated method for superadmin', async () => {
      const req = { user: { id: 1, role: 'superadmin' }, params: { id: '1' }, body: { name: 'Updated', code: 'cash', description: null, icon: null, display_order: 0, is_active: true } };
      PaymentMethod.getById.mockResolvedValue({ id: 1, cafe_id: 2 });
      PaymentMethod.update.mockResolvedValue({ id: 1, name: 'Updated' });
      const res = mockRes();
      await handler(req, res);
      expect(PaymentMethod.update).toHaveBeenCalledWith('1', 2, expect.any(Object));
      expect(res.json).toHaveBeenCalledWith({ id: 1, name: 'Updated' });
    });
    it('returns 200 for cafe user when existing found', async () => {
      const req = { user: { id: 1, role: 'admin' }, params: { id: '1' }, body: { name: 'X', code: 'c', description: null, icon: null, display_order: 0, is_active: true } };
      User.findByIdWithCafe.mockResolvedValue({ id: 1, cafe_id: 2 });
      PaymentMethod.getById.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 1, name: 'X' });
      PaymentMethod.update.mockResolvedValue({ id: 1, name: 'X' });
      const res = mockRes();
      await handler(req, res);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ id: 1, name: 'X' });
    });
    it('returns 500 on update error', async () => {
      const req = { user: { id: 1, role: 'superadmin' }, params: { id: '1' }, body: { name: 'X', code: 'x' } };
      PaymentMethod.getById.mockResolvedValue({ id: 1, cafe_id: null });
      PaymentMethod.update.mockRejectedValue(new Error('db'));
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('DELETE /api/admin/payment-methods/:id', () => {
    const handler = getHandler('DELETE', '/api/admin/payment-methods/:id');
    it('returns 403 when cafe user and method not found', async () => {
      const req = { user: { id: 1, role: 'admin' }, params: { id: '99' } };
      User.findByIdWithCafe.mockResolvedValue({ id: 1, cafe_id: 2 });
      PaymentMethod.getById.mockResolvedValue(null);
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it('returns 404 when superadmin and method not found', async () => {
      const req = { user: { id: 1, role: 'superadmin' }, params: { id: '99' } };
      PaymentMethod.getById.mockResolvedValue(null);
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it('returns 200 with result for superadmin', async () => {
      const req = { user: { id: 1, role: 'superadmin' }, params: { id: '1' } };
      PaymentMethod.getById.mockResolvedValue({ id: 1, cafe_id: 2 });
      PaymentMethod.delete.mockResolvedValue({ success: true, message: 'Payment method deleted successfully' });
      const res = mockRes();
      await handler(req, res);
      expect(PaymentMethod.delete).toHaveBeenCalledWith('1', 2);
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Payment method deleted successfully' });
    });
    it('returns 500 on delete error', async () => {
      const req = { user: { id: 1, role: 'superadmin' }, params: { id: '1' } };
      PaymentMethod.getById.mockResolvedValue({ id: 1, cafe_id: null });
      PaymentMethod.delete.mockRejectedValue(new Error('db'));
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('PATCH /api/admin/payment-methods/:id/toggle', () => {
    const handler = getHandler('PATCH', '/api/admin/payment-methods/:id/toggle');
    it('returns 403 when cafe user and method not found', async () => {
      const req = { user: { id: 1, role: 'admin' }, params: { id: '99' } };
      User.findByIdWithCafe.mockResolvedValue({ id: 1, cafe_id: 2 });
      PaymentMethod.getById.mockResolvedValue(null);
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it('returns 200 with toggled method', async () => {
      const req = { user: { id: 1, role: 'superadmin' }, params: { id: '1' } };
      PaymentMethod.getById.mockResolvedValue({ id: 1, cafe_id: 2, is_active: true });
      PaymentMethod.toggleStatus.mockResolvedValue({ id: 1, is_active: false });
      const res = mockRes();
      await handler(req, res);
      expect(PaymentMethod.toggleStatus).toHaveBeenCalledWith('1', 2);
      expect(res.json).toHaveBeenCalledWith({ id: 1, is_active: false });
    });
    it('returns 500 on toggle error', async () => {
      const req = { user: { id: 1, role: 'superadmin' }, params: { id: '1' } };
      PaymentMethod.getById.mockResolvedValue({ id: 1, cafe_id: null });
      PaymentMethod.toggleStatus.mockRejectedValue(new Error('db'));
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /api/admin/payment-methods/reorder', () => {
    const handler = getHandler('POST', '/api/admin/payment-methods/reorder');
    it('returns 400 when orderedIds missing or not array', async () => {
      const req = { user: { id: 1, role: 'superadmin' }, body: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Ordered IDs array is required' });
    });
    it('returns 400 when orderedIds is empty for superadmin', async () => {
      const req = { user: { id: 1, role: 'superadmin' }, body: { orderedIds: [] } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 403 when superadmin and first method not found', async () => {
      const req = { user: { id: 1, role: 'superadmin' }, body: { orderedIds: [1, 2] } };
      PaymentMethod.getById.mockResolvedValue(null);
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it('returns 403 when cafe user and one method not found', async () => {
      const req = { user: { id: 1, role: 'admin' }, body: { orderedIds: [1, 2] } };
      User.findByIdWithCafe.mockResolvedValue({ id: 1, cafe_id: 2 });
      PaymentMethod.getById.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Payment method 2 not found or access denied' });
    });
    it('returns 200 with reorder result', async () => {
      const req = { user: { id: 1, role: 'superadmin' }, body: { orderedIds: [2, 1] } };
      PaymentMethod.getById.mockResolvedValue({ id: 1, cafe_id: 2 });
      PaymentMethod.reorder.mockResolvedValue({ success: true, message: 'Payment methods reordered successfully' });
      const res = mockRes();
      await handler(req, res);
      expect(PaymentMethod.reorder).toHaveBeenCalledWith(2, [2, 1]);
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Payment methods reordered successfully' });
    });
    it('returns 500 on reorder error', async () => {
      const req = { user: { id: 1, role: 'superadmin' }, body: { orderedIds: [1] } };
      PaymentMethod.getById.mockResolvedValue({ id: 1, cafe_id: 2 });
      PaymentMethod.reorder.mockRejectedValue(new Error('db'));
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
