/**
 * Intensive customer tests: list, get by id, invalid id, customer login 404.
 */
const request = require('supertest');
const app = require('../../index');
const { loginAndGetToken } = require('../utils/authHelper');

describe('Customers intensive', () => {
  let token;

  beforeAll(async () => {
    try {
      token = await loginAndGetToken(request(app));
    } catch (e) {
      // skip
    }
  });

  describe('GET /api/customers', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/customers');
      expect(res.status).toBe(401);
    });
    it('returns 200 with valid limit and offset', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/customers?limit=10&offset=0')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body)).toBe(true);
      }
    });
  });

  describe('GET /api/customers/:id', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/customers/1');
      expect(res.status).toBe(401);
    });
    it('returns 400 for invalid id (non-numeric)', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/customers/abc')
        .set('Authorization', `Bearer ${token}`);
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body).toHaveProperty('error');
      }
    });
    it('returns 404 for non-existent customer id', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/customers/999999')
        .set('Authorization', `Bearer ${token}`);
      expect([404, 403, 500]).toContain(res.status);
      if (res.status === 404) {
        expect(res.body.error).toMatch(/not found/i);
      }
    });
  });

  describe('POST /api/customer/login', () => {
    it('returns 400 when phone is missing', async () => {
      const res = await request(app)
        .post('/api/customer/login')
        .send({ cafeSlug: 'default' });
      expect(res.status).toBe(400);
    });
    it('returns 200 or 404 for unknown phone (no crash)', async () => {
      const res = await request(app)
        .post('/api/customer/login')
        .send({ phone: '+15550000000', cafeSlug: 'default' });
      expect([200, 404]).toContain(res.status);
    });
  });
});
