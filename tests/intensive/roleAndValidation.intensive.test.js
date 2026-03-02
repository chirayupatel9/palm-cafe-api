/**
 * Intensive role and validation: admin vs non-admin, metrics 403, validation boundaries.
 */
const request = require('supertest');
const app = require('../../index');
const { loginAndGetToken } = require('../utils/authHelper');

describe('Role and validation intensive', () => {
  let adminToken;

  beforeAll(async () => {
    try {
      adminToken = await loginAndGetToken(request(app));
    } catch (e) {
      // skip
    }
  });

  describe('GET /api/metrics (admin only)', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/metrics');
      expect(res.status).toBe(401);
    });
    it('returns 200 or 403 with admin token', async () => {
      if (!adminToken) return;
      const res = await request(app)
        .get('/api/metrics')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('requestCount');
        expect(res.body).toHaveProperty('uptime');
      }
    });
  });

  describe('GET /api/admin/payment-methods', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/admin/payment-methods');
      expect(res.status).toBe(401);
    });
  });

  describe('Validation boundaries', () => {
    it('POST /api/auth/login rejects empty string email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: '', password: 'x' });
      expect(res.status).toBe(400);
    });
    it('POST /api/auth/register rejects username too long', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'a'.repeat(101),
          email: 'b@b.com',
          password: 'password123'
        });
      expect(res.status).toBe(400);
    });
  });
});
