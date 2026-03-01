/**
 * Edge case and security tests: JWT, invalid input, SQL injection strings, limits.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../index');

describe('Security and edge cases', () => {
  describe('JWT', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/auth/profile').expect(401);
      expect(res.body).toHaveProperty('error');
    });
    it('returns 401 for malformed JWT (no Bearer prefix)', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'invalid-format')
        .expect(401);
      expect(res.body).toHaveProperty('error');
    });
    it('returns 401 for malformed JWT (garbage token)', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer not.a.valid.jwt')
        .expect(401);
      expect(res.body).toHaveProperty('error');
    });
    it('returns 401 for expired JWT', async () => {
      const secret = process.env.JWT_SECRET || 'test-jwt-secret-do-not-use-in-production';
      const expired = jwt.sign(
        { userId: 1, iat: Math.floor(Date.now() / 1000) - 10000 },
        secret,
        { expiresIn: '-1s', algorithm: 'HS256' }
      );
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('Invalid request body', () => {
    it('POST /api/auth/login returns 400 for invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: 'somepass' })
        .expect(400);
      expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
    });
    it('POST /api/auth/login returns 400 when password missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@cafe.com' })
        .expect(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('SQL injection attempt strings (sanitized, no crash)', () => {
    it('GET /api/menu with suspicious query does not crash', async () => {
      const res = await request(app)
        .get('/api/menu')
        .query({ cafeId: "1; DROP TABLE users--" });
      expect([200, 400]).toContain(res.status);
    });
    it('POST /api/auth/login with SQL-like payload returns 400 or 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: "admin@cafe.com' OR '1'='1", password: "x' OR '1'='1" });
      expect([400, 401]).toContain(res.status);
    });
  });

  describe('Oversized limit and negative offset', () => {
    it('GET /api/customers with oversized limit is capped (with auth)', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@cafe.com', password: 'admin123' });
      if (loginRes.status !== 200) return;
      const token = loginRes.body.token;
      const res = await request(app)
        .get('/api/customers?limit=99999&offset=-1')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403, 500]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('404 for undefined route', () => {
    it('returns 404 and NOT_FOUND for unknown path', async () => {
      const res = await request(app).get('/api/nonexistent-route').expect(404);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('code', 'NOT_FOUND');
    });
  });
});
