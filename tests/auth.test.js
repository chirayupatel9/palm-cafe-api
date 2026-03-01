const request = require('supertest');
const app = require('../index');

describe('Auth', () => {
  describe('POST /api/auth/login', () => {
    it('returns 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'admin123' })
        .expect(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 401 or 500 for invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong' });
      expect([401, 500]).toContain(res.status);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 200 and token for valid credentials (default admin)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@cafe.com', password: 'admin123' })
        .expect(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('email', 'admin@cafe.com');
      expect(res.body.user).toHaveProperty('username', 'admin');
    });
  });

  describe('GET /api/auth/profile', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/auth/profile').expect(401);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 401 with invalid token', async () => {
      await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('returns 200 with valid token', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@cafe.com', password: 'admin123' });
      const token = loginRes.body.token;
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe('admin@cafe.com');
    });
  });
});
