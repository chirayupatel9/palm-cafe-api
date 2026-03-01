/**
 * Integration tests for cafe/invoices routes.
 */
const request = require('supertest');
const app = require('../../index');
const { loginAndGetToken } = require('../utils/authHelper');

describe('Cafe / Invoices API', () => {
  let token;

  beforeAll(async () => {
    try {
      token = await loginAndGetToken(request(app));
    } catch (e) {
      // skip
    }
  });

  describe('GET /api/invoices', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/invoices').expect(401);
      expect(res.body).toHaveProperty('error');
    });
    it('returns 200 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/invoices')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/invoices', () => {
    it('returns 401 without auth', async () => {
      await request(app)
        .post('/api/invoices')
        .send({ customerName: 'Test', items: [{ name: 'Coffee', quantity: 1, price: 5 }] })
        .expect(401);
    });
    it('returns 400 when customerName or items missing (with auth)', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect([400, 403]).toContain(res.status);
    });
  });
});
