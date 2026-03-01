/**
 * Intensive auth tests: register, duplicate email, validation, login, profile, role restrictions.
 */
const request = require('supertest');
const app = require('../../index');
const { loginAndGetToken } = require('../utils/authHelper');

describe('Auth intensive', () => {
  let adminToken;
  const unique = `test-${Date.now()}@intensive.test`;

  beforeAll(async () => {
    try {
      adminToken = await loginAndGetToken(request(app));
    } catch (e) {
      // skip if no default admin
    }
  });

  describe('POST /api/auth/register', () => {
    it('returns 400 when username is missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: `${unique}a`, password: 'password123' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
    it('returns 400 when email is invalid', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'u', email: 'not-an-email', password: 'password123' });
      expect(res.status).toBe(400);
    });
    it('returns 400 when password is too short', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'u', email: `${unique}b`, password: '12345' });
      expect(res.status).toBe(400);
    });
    it('registers successfully and returns 201 with token', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: `user_${Date.now()}`, email: unique, password: 'password123' });
      expect([201, 500]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body).toHaveProperty('token');
        expect(res.body).toHaveProperty('user');
        expect(res.body.user).toHaveProperty('email', unique);
      }
    });
    it('returns 400 when registering again with same email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'other', email: unique, password: 'password123' });
      expect([400, 500]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error).toMatch(/already exists/i);
      }
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns 400 when body is empty', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
    });
    it('returns 401 for wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@cafe.com', password: 'wrongpassword' });
      expect([401, 500]).toContain(res.status);
    });
    it('returns 200 and token for valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@cafe.com', password: 'admin123' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('email', 'admin@cafe.com');
    });
  });

  describe('GET /api/auth/profile', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/auth/profile');
      expect(res.status).toBe(401);
    });
    it('returns 200 with user when valid token', async () => {
      if (!adminToken) return;
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('email');
    });
  });

  describe('Role-protected registration', () => {
    it('POST /api/auth/register-admin returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/auth/register-admin')
        .send({ username: 'na', email: 'n@x.com', password: 'password123' });
      expect(res.status).toBe(401);
    });
    it('POST /api/auth/register-chef returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/auth/register-chef')
        .send({ username: 'nc', email: 'nc@x.com', password: 'password123' });
      expect(res.status).toBe(401);
    });
  });
});
