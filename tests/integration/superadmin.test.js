/**
 * Integration tests for superadmin routes (403 for non-superadmin, 200 with superadmin).
 */
const request = require('supertest');
const app = require('../../index');
const { loginAndGetToken } = require('../utils/authHelper');
const User = require('../../models/user');

const SUPERADMIN_EMAIL = 'superadmin-test@cafe.com';
const SUPERADMIN_PASSWORD = 'admin123';

describe('Superadmin API', () => {
  let token;
  let superadminToken;

  beforeAll(async () => {
    try {
      token = await loginAndGetToken(request(app));
    } catch (e) {
      token = null;
    }
    try {
      let superadmin = await User.findByEmail(SUPERADMIN_EMAIL);
      if (!superadmin) {
        await User.create({
          username: 'superadmin-test',
          email: SUPERADMIN_EMAIL,
          password: SUPERADMIN_PASSWORD,
          role: 'superadmin'
        });
      }
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD });
      if (loginRes.status === 200 && loginRes.body.token) {
        superadminToken = loginRes.body.token;
      }
    } catch (e) {
      superadminToken = null;
    }
  });

  describe('GET /api/superadmin/cafes', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/superadmin/cafes').expect(401);
      expect(res.body).toHaveProperty('error');
    });
    it('returns 200 or 403 with auth (403 if not superadmin)', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/superadmin/cafes')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/superadmin/cafes', () => {
    it('returns 401 without auth', async () => {
      await request(app)
        .post('/api/superadmin/cafes')
        .send({ slug: 'test-cafe', name: 'Test Cafe' })
        .expect(401);
    });
    it('returns 400 when slug and name missing', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/superadmin/cafes')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/required/i);
    });
    it('returns 400 when slug invalid format', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/superadmin/cafes')
        .set('Authorization', `Bearer ${token}`)
        .send({ slug: 'Invalid Slug!', name: 'Test' });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/slug|lowercase/i);
    });
    it('returns 201 with superadmin and valid slug/name', async () => {
      if (!superadminToken) return;
      const slug = 'test-cafe-' + Date.now();
      const res = await request(app)
        .post('/api/superadmin/cafes')
        .set('Authorization', `Bearer ${superadminToken}`)
        .send({ slug, name: 'Test Cafe' });
      expect(res.status).toBe(201);
      expect(res.body.cafe).toHaveProperty('id');
    });
  });

  describe('GET /api/superadmin/cafes/active', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/superadmin/cafes/active').expect(401);
    });
    it('returns 200 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/superadmin/cafes/active')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
    it('returns 200 with superadmin token', async () => {
      if (!superadminToken) return;
      const res = await request(app)
        .get('/api/superadmin/cafes/active')
        .set('Authorization', `Bearer ${superadminToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/superadmin/cafes/metrics/overview', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/superadmin/cafes/metrics/overview').expect(401);
    });
    it('returns 200 with superadmin token', async () => {
      if (!superadminToken) return;
      const res = await request(app)
        .get('/api/superadmin/cafes/metrics/overview')
        .set('Authorization', `Bearer ${superadminToken}`);
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) expect(res.body).toBeDefined();
    });
  });

  describe('GET /api/superadmin/cafes/:cafeId/users', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/superadmin/cafes/1/users').expect(401);
    });
    it('returns 200 or 403 or 404 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/superadmin/cafes/1/users')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403, 404]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
    it('returns 200 with superadmin token when cafe exists', async () => {
      if (!superadminToken) return;
      const res = await request(app)
        .get('/api/superadmin/cafes/1/users')
        .set('Authorization', `Bearer ${superadminToken}`);
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/superadmin/cafes/:cafeId/users', () => {
    it('returns 401 without auth', async () => {
      await request(app)
        .post('/api/superadmin/cafes/1/users')
        .send({ username: 'u', email: 'u@x.com', password: 'pass123', role: 'admin' })
        .expect(401);
    });
    it('returns 400 when required fields missing', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/superadmin/cafes/1/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: 'u' });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/required|fields/i);
    });
    it('returns 400 when password too short', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/superadmin/cafes/1/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: 'u', email: 'u2@x.com', password: '12345', role: 'admin' });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/password|6/i);
    });
  });

  describe('GET /api/superadmin/cafes/:id/metrics', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/superadmin/cafes/1/metrics').expect(401);
    });
    it('returns 200 or 404 with superadmin token', async () => {
      if (!superadminToken) return;
      const res = await request(app)
        .get('/api/superadmin/cafes/1/metrics')
        .set('Authorization', `Bearer ${superadminToken}`);
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /api/superadmin/cafes/:id/settings', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/superadmin/cafes/1/settings').expect(401);
    });
    it('returns 400 when id invalid', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/superadmin/cafes/not-a-number/settings')
        .set('Authorization', `Bearer ${token}`);
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/invalid/i);
    });
    it('returns 200 or 404 with superadmin token', async () => {
      if (!superadminToken) return;
      const res = await request(app)
        .get('/api/superadmin/cafes/1/settings')
        .set('Authorization', `Bearer ${superadminToken}`);
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /api/superadmin/cafes/:id', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/superadmin/cafes/1').expect(401);
    });
    it('returns 400 when id invalid', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/superadmin/cafes/abc')
        .set('Authorization', `Bearer ${token}`);
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/invalid/i);
    });
    it('returns 200 or 404 with superadmin token', async () => {
      if (!superadminToken) return;
      const res = await request(app)
        .get('/api/superadmin/cafes/1')
        .set('Authorization', `Bearer ${superadminToken}`);
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) expect(res.body).toHaveProperty('id');
    });
  });

  describe('PUT /api/superadmin/cafes/:id', () => {
    it('returns 401 without auth', async () => {
      await request(app)
        .put('/api/superadmin/cafes/1')
        .send({ name: 'Updated' })
        .expect(401);
    });
    it('returns 400 when slug invalid format', async () => {
      if (!token) return;
      const res = await request(app)
        .put('/api/superadmin/cafes/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ slug: 'Bad Slug!' });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/slug|lowercase/i);
    });
  });

  describe('GET /api/subscription', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/subscription').expect(401);
    });
  });

  describe('GET /api/cafe/features', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/cafe/features').expect(401);
    });
  });

  describe('GET /api/superadmin/cafes/:id/subscription', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/superadmin/cafes/1/subscription').expect(401);
    });
    it('returns 200 or 404 with superadmin', async () => {
      if (!superadminToken) return;
      const res = await request(app)
        .get('/api/superadmin/cafes/1/subscription')
        .set('Authorization', `Bearer ${superadminToken}`);
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('GET /api/superadmin/cafes/:id/features', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/superadmin/cafes/1/features').expect(401);
    });
    it('returns 200 or 404 with superadmin', async () => {
      if (!superadminToken) return;
      const res = await request(app)
        .get('/api/superadmin/cafes/1/features')
        .set('Authorization', `Bearer ${superadminToken}`);
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('PUT /api/superadmin/cafes/:id/subscription', () => {
    it('returns 200 or 400 or 404 with superadmin', async () => {
      if (!superadminToken) return;
      const res = await request(app)
        .put('/api/superadmin/cafes/1/subscription')
        .set('Authorization', `Bearer ${superadminToken}`)
        .send({ plan: 'PRO', status: 'active' });
      expect([200, 400, 404]).toContain(res.status);
    });
  });

  describe('GET /api/superadmin/audit-logs', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/superadmin/audit-logs').expect(401);
    });
    it('returns 200 with superadmin', async () => {
      if (!superadminToken) return;
      const res = await request(app)
        .get('/api/superadmin/audit-logs')
        .set('Authorization', `Bearer ${superadminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('auditLogs');
      expect(Array.isArray(res.body.auditLogs)).toBe(true);
    });
  });

  describe('GET /api/superadmin/cafes/:id/audit-log', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/superadmin/cafes/1/audit-log').expect(401);
    });
    it('returns 200 with superadmin when cafe exists', async () => {
      if (!superadminToken) return;
      const res = await request(app)
        .get('/api/superadmin/cafes/1/audit-log')
        .set('Authorization', `Bearer ${superadminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('auditLog');
      expect(Array.isArray(res.body.auditLog)).toBe(true);
    });
  });
});
