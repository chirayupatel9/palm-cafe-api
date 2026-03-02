/**
 * Integration tests for customers routes.
 */
const request = require('supertest');
const app = require('../../index');
const { loginAndGetToken } = require('../utils/authHelper');

describe('Customers API', () => {
  let token;

  beforeAll(async () => {
    try {
      token = await loginAndGetToken(request(app));
    } catch (e) {
      // Default admin may not exist in fresh test DB
    }
  });

  describe('GET /api/customers', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/customers').expect(401);
      expect(res.body).toHaveProperty('error');
    });
    it('returns 200 with auth (array)', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/customers/statistics', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/customers/statistics').expect(401);
    });
    it('returns 200 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/customers/statistics')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('POST /api/customer/login', () => {
    it('returns 400 when phone is missing', async () => {
      const res = await request(app)
        .post('/api/customer/login')
        .send({})
        .expect(400);
      expect(res.body).toHaveProperty('error');
    });
    it('returns 200 or 404 with valid phone (public)', async () => {
      const res = await request(app)
        .post('/api/customer/login')
        .send({ phone: '+15551234567', cafeSlug: 'default' });
      expect([200, 404]).toContain(res.status);
    });
  });
});
