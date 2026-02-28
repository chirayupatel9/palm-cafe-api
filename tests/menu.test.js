const request = require('supertest');
const app = require('../index');

describe('Menu', () => {
  describe('POST /api/menu (mutation requires auth)', () => {
    it('returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/menu')
        .send({ name: 'Test Item', price: 1.99 })
        .expect(401);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 401 with invalid token', async () => {
      await request(app)
        .post('/api/menu')
        .set('Authorization', 'Bearer invalid-token')
        .send({ name: 'Test Item', price: 1.99 })
        .expect(401);
    });
  });

  describe('GET /api/menu (public read)', () => {
    it('returns 200 without auth', async () => {
      const res = await request(app).get('/api/menu').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
