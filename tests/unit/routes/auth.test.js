/**
 * Unit tests for routes/auth.js handlers. User and jwt mocked.
 */
jest.mock('jsonwebtoken', () => ({ sign: jest.fn().mockReturnValue('mock-token'), verify: jest.fn() }));
jest.mock('../../../models/user');
jest.mock('../../../middleware/auth', () => ({ auth: (req, res, next) => next(), chefAuth: (req, res, next) => next() }));
jest.mock('../../../middleware/rateLimiter', () => ({ authLimiter: (req, res, next) => next() }));
jest.mock('../../../middleware/validateAuth', () => ({
  registerValidation: (req, res, next) => next(),
  loginValidation: (req, res, next) => next(),
  handleValidationErrors: (req, res, next) => next()
}));
jest.mock('../../../config/logger', () => ({ error: jest.fn() }));

const jwt = require('jsonwebtoken');
const User = require('../../../models/user');

const routes = {};
const mockApp = {
  get: (path, ...fns) => { routes[`GET ${path}`] = fns; },
  post: (path, ...fns) => { routes[`POST ${path}`] = fns; }
};

require('../../../routes/auth')(mockApp);

function getHandler(method, path) {
  const stack = routes[`${method} ${path}`];
  return stack ? stack[stack.length - 1] : null;
}

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

describe('routes/auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.sign.mockReturnValue('mock-token');
  });

  describe('POST /api/auth/register', () => {
    const handler = getHandler('POST', '/api/auth/register');
    it('returns 400 when email already exists', async () => {
      User.findByEmail.mockResolvedValue({ id: 1 });
      const req = { body: { username: 'u', email: 'e@x.com', password: 'pass123' }, requestId: 'r1' };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'User with this email already exists' });
      expect(User.create).not.toHaveBeenCalled();
    });
    it('returns 201 with user and token on success', async () => {
      User.findByEmail.mockResolvedValue(null);
      User.create.mockResolvedValue({ id: 10, username: 'u', email: 'e@x.com', role: 'user' });
      const req = { body: { username: 'u', email: 'e@x.com', password: 'pass123' }, requestId: 'r1' };
      const res = mockRes();
      await handler(req, res);
      expect(User.create).toHaveBeenCalledWith({ username: 'u', email: 'e@x.com', password: 'pass123' });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User registered successfully',
        user: expect.objectContaining({ id: 10, username: 'u', email: 'e@x.com' }),
        token: 'mock-token'
      }));
    });
    it('returns 500 on create error', async () => {
      User.findByEmail.mockResolvedValue(null);
      User.create.mockRejectedValue(new Error('db'));
      const req = { body: { username: 'u', email: 'e@x.com', password: 'pass123' }, requestId: 'r1' };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to register user' });
    });
  });

  describe('POST /api/auth/register-admin', () => {
    const handler = getHandler('POST', '/api/auth/register-admin');
    it('returns 400 when email exists', async () => {
      User.findByEmail.mockResolvedValue({ id: 1 });
      const req = { body: { username: 'a', email: 'a@x.com', password: 'pass123' }, requestId: 'r1' };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 201 with admin user', async () => {
      User.findByEmail.mockResolvedValue(null);
      User.create.mockResolvedValue({ id: 11, username: 'a', email: 'a@x.com', role: 'admin' });
      const req = { body: { username: 'a', email: 'a@x.com', password: 'pass123' }, requestId: 'r1' };
      const res = mockRes();
      await handler(req, res);
      expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Admin registered successfully' }));
    });
    it('returns 500 on error', async () => {
      User.findByEmail.mockResolvedValue(null);
      User.create.mockRejectedValue(new Error('db'));
      const req = { body: { username: 'a', email: 'a@x.com', password: 'pass123' }, requestId: 'r1' };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to register admin' });
    });
  });

  describe('POST /api/auth/register-superadmin', () => {
    const handler = getHandler('POST', '/api/auth/register-superadmin');
    it('returns 403 when user is not superadmin', async () => {
      const req = { user: { role: 'admin' }, body: { username: 's', email: 's@x.com', password: 'pass123' }, requestId: 'r1' };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Only superadmins can register new superadmins' });
      expect(User.create).not.toHaveBeenCalled();
    });
    it('returns 201 when superadmin creates superadmin', async () => {
      const req = { user: { role: 'superadmin' }, body: { username: 's', email: 's@x.com', password: 'pass123' }, requestId: 'r1' };
      User.findByEmail.mockResolvedValue(null);
      User.create.mockResolvedValue({ id: 12, username: 's', email: 's@x.com', role: 'superadmin' });
      const res = mockRes();
      await handler(req, res);
      expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'superadmin' }));
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('POST /api/auth/login', () => {
    const handler = getHandler('POST', '/api/auth/login');
    it('returns 401 when user not found', async () => {
      User.findByEmail.mockResolvedValue(null);
      const req = { body: { email: 'nope@x.com', password: 'pass' }, requestId: 'r1' };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid email or password' });
    });
    it('returns 401 when password invalid', async () => {
      User.findByEmail.mockResolvedValue({ id: 1 });
      User.findByIdWithCafe.mockResolvedValue({ id: 1 });
      User.validatePassword.mockResolvedValue(false);
      const req = { body: { email: 'e@x.com', password: 'wrong' }, requestId: 'r1' };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid email or password' });
    });
    it('returns 200 with user and token on success', async () => {
      const user = { id: 1, username: 'u', email: 'e@x.com', role: 'user', cafe_id: 2, cafe_slug: 'c', cafe_name: 'C' };
      User.findByEmail.mockResolvedValue({ id: 1 });
      User.findByIdWithCafe.mockResolvedValue(user);
      User.validatePassword.mockResolvedValue(true);
      User.updateLastLogin.mockResolvedValue();
      const req = { body: { email: 'e@x.com', password: 'pass' }, requestId: 'r1' };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Login successful',
        user: expect.objectContaining({ id: 1, username: 'u', email: 'e@x.com', role: 'user', cafe_id: 2 }),
        token: 'mock-token'
      }));
    });
    it('returns 500 on error', async () => {
      User.findByEmail.mockRejectedValue(new Error('db'));
      const req = { body: { email: 'e@x.com', password: 'pass' }, requestId: 'r1' };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to login' });
    });
  });

  describe('GET /api/auth/profile', () => {
    const handler = getHandler('GET', '/api/auth/profile');
    it('returns 404 when user not found', async () => {
      User.findByIdWithCafe.mockResolvedValue(null);
      const req = { user: { id: 999 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });
    it('returns 200 with user when not impersonating', async () => {
      const user = { id: 1, username: 'u', email: 'e@x.com', role: 'user', cafe_id: 2, cafe_slug: 'c', cafe_name: 'C' };
      User.findByIdWithCafe.mockResolvedValue(user);
      const req = { user: { id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({
        user: { id: 1, username: 'u', email: 'e@x.com', role: 'user', cafe_id: 2, cafe_slug: 'c', cafe_name: 'C' },
        impersonation: { isImpersonating: false }
      });
    });
    it('returns 200 with impersonation info when impersonating', async () => {
      const user = { id: 1, username: 'u', email: 'e@x.com', role: 'user', cafe_id: 2 };
      User.findByIdWithCafe.mockResolvedValue(user);
      const req = {
        user: { id: 1 },
        impersonation: {
          isImpersonating: true,
          impersonatedRole: 'admin',
          cafeId: 3,
          cafeSlug: 's',
          cafeName: 'S',
          originalUserId: 10,
          originalRole: 'superadmin'
        }
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({
        user: expect.objectContaining({ role: 'admin', cafe_id: 3, cafe_slug: 's', cafe_name: 'S' }),
        impersonation: expect.objectContaining({ isImpersonating: true, cafeId: 3, originalUserId: 10 })
      });
    });
    it('returns 500 on error', async () => {
      User.findByIdWithCafe.mockRejectedValue(new Error('db'));
      const req = { user: { id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get profile' });
    });
  });

  describe('GET /api/server/time', () => {
    const handler = getHandler('GET', '/api/server/time');
    it('returns 200 with server time and cors', async () => {
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        serverTime: expect.any(String),
        timestamp: expect.any(Number),
        cors: 'working'
      }));
    });
    it('returns 500 when res.json throws', async () => {
      const req = {};
      const res = mockRes();
      res.json.mockImplementationOnce(() => { throw new Error('send fail'); });
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get server time' });
    });
  });

  describe('GET /api/cors-test', () => {
    const handler = getHandler('GET', '/api/cors-test');
    it('returns 200 with CORS message and origin', () => {
      const req = { headers: { origin: 'http://localhost:3000' }, method: 'GET' };
      const res = mockRes();
      handler(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'CORS is working!',
        origin: 'http://localhost:3000',
        method: 'GET'
      }));
    });
  });
});
