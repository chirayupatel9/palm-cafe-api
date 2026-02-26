const request = require('supertest');
const app = require('../index');

describe('Health', () => {
  describe('GET /api/health', () => {
    it('returns 200 with status and database', async () => {
      const res = await request(app).get('/api/health').expect(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('database');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('memory');
      expect(['OK', 'DEGRADED']).toContain(res.body.status);
    });

    it('returns JSON with optional requestId', async () => {
      const res = await request(app).get('/api/health').expect(200);
      expect(res.body).toHaveProperty('status');
      if (res.body.requestId) {
        expect(typeof res.body.requestId).toBe('string');
      }
    });
  });
});
