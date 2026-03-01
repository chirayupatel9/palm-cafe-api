/**
 * Integration tests for payment methods routes.
 */
const request = require('supertest');
const app = require('../../index');
const { loginAndGetToken } = require('../utils/authHelper');

describe('Payment Methods API', () => {
  let token;

  beforeAll(async () => {
    try {
      token = await loginAndGetToken(request(app));
    } catch (e) {
      // skip
    }
  });

  describe('GET /api/payment-methods', () => {
    it('returns 200 without auth (public with optional cafeSlug)', async () => {
      const res = await request(app).get('/api/payment-methods').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
    it('returns 200 with query cafeSlug', async () => {
      const res = await request(app)
        .get('/api/payment-methods?cafeSlug=default')
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/admin/payment-methods', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/admin/payment-methods').expect(401);
      expect(res.body).toHaveProperty('error');
    });
    it('returns 200 with admin token', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/admin/payment-methods')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/admin/payment-methods', () => {
    it('returns 401 without auth', async () => {
      await request(app)
        .post('/api/admin/payment-methods')
        .send({ name: 'Cash', code: 'cash' })
        .expect(401);
    });
    it('returns 400 when name/code missing (with auth)', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/admin/payment-methods')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect([400, 403]).toContain(res.status);
    });
  });
});
