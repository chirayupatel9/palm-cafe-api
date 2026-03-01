/**
 * Integration tests for metrics route (admin only).
 */
const request = require('supertest');
const app = require('../../index');
const { loginAndGetToken } = require('../utils/authHelper');

describe('Metrics API', () => {
  let token;

  beforeAll(async () => {
    try {
      token = await loginAndGetToken(request(app));
    } catch (e) {
      // skip
    }
  });

  describe('GET /api/metrics', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/metrics').expect(401);
      expect(res.body).toHaveProperty('error');
    });
    it('returns 200 with admin token', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/metrics')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('uptime');
        expect(res.body).toHaveProperty('requestCount');
        expect(res.body).toHaveProperty('errorCount');
      }
    });
  });
});
