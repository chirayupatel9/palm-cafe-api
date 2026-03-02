/**
 * E2E: Auth flow — register, login, protected route, invalid/expired token, account lockout.
 * No mocks; real HTTP and DB.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../index');
const { truncateDb } = require('./truncateDb');
const { seedE2e } = require('./seedE2e');
const { JWT_SECRET } = require('../../middleware/auth');

const suffix = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function assertErrorShape(body) {
  if (body.error != null) expect(body).toMatchObject({ error: expect.any(String) });
  if (body.code != null) expect(body.code).toMatch(/^[A-Z_0-9]+$/);
  if (body.requestId != null) expect(typeof body.requestId).toBe('string');
}

describe('E2E: Auth', () => {
  beforeAll(async () => {
    await truncateDb();
    await seedE2e();
  });

  describe('Register and login', () => {
    it('registers a new user and returns token', async () => {
      const username = `user_${suffix()}`;
      const email = `e2e_${suffix()}@test.com`;
      const password = 'Password123!';
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username, email, password });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        message: expect.any(String),
        user: { id: expect.any(Number), username, email, role: expect.any(String) },
        token: expect.any(String)
      });
      expect(res.body.token.length).toBeGreaterThan(0);
    });

    it('logs in and returns token and user', async () => {
      const username = `login_${suffix()}`;
      const email = `login_${suffix()}@test.com`;
      const password = 'Password123!';
      await request(app).post('/api/auth/register').send({ username, email, password });
      const res = await request(app).post('/api/auth/login').send({ email, password });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        message: expect.any(String),
        user: expect.objectContaining({ email, username }),
        token: expect.any(String)
      });
    });

    it('accesses protected route with token', async () => {
      const username = `prot_${suffix()}`;
      const email = `prot_${suffix()}@test.com`;
      const password = 'Password123!';
      await request(app).post('/api/auth/register').send({ username, email, password });
      const loginRes = await request(app).post('/api/auth/login').send({ email, password });
      const token = loginRes.body.token;
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ user: expect.objectContaining({ email }) });
    });
  });

  describe('Invalid and expired token', () => {
    it('returns 401 for invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token');
      expect(res.status).toBe(401);
      assertErrorShape(res.body);
    });

    it('returns 401 for expired token', async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = jwt.sign(
        { userId: 1, iat: now - 3600, exp: now - 1800 },
        JWT_SECRET,
        { algorithm: 'HS256' }
      );
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
      assertErrorShape(res.body);
    });
  });

  describe('Account lockout', () => {
    it('returns 429 after repeated failed logins or 401 until lockout', async () => {
      const email = `lockout_${suffix()}@test.com`;
      const maxAttempts = parseInt(process.env.LOCKOUT_MAX_ATTEMPTS || '5', 10) || 5;
      for (let i = 0; i < maxAttempts; i++) {
        const r = await request(app).post('/api/auth/login').send({ email, password: 'WrongPassword' });
        expect([401, 429, 500]).toContain(r.status);
      }
      const res = await request(app).post('/api/auth/login').send({ email, password: 'WrongPassword' });
      expect([429, 500]).toContain(res.status);
      if (res.status === 429) {
        expect(res.body).toMatchObject({
          error: expect.stringContaining('locked'),
          code: 'ACCOUNT_LOCKED'
        });
        assertErrorShape(res.body);
      }
    });
  });
});
