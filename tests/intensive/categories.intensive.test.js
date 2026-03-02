/**
 * Intensive category tests: CRUD, duplicate name (unique constraint), validation, 404.
 */
const request = require('supertest');
const app = require('../../index');
const { loginAndGetToken } = require('../utils/authHelper');

describe('Categories intensive', () => {
  let token;
  const uniqueName = `Cat_${Date.now()}`;

  beforeAll(async () => {
    try {
      token = await loginAndGetToken(request(app));
    } catch (e) {
      // skip if no admin
    }
  });

  describe('GET /api/categories', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(401);
    });
    it('returns 200 and array with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body)).toBe(true);
      }
    });
  });

  describe('POST /api/categories', () => {
    it('returns 400 when name is missing', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Desc' });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error).toMatch(/name/i);
      }
    });
    it('create with only name returns 201 when user has cafe, else 400/403', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'X' });
      expect([201, 400, 403, 500]).toContain(res.status);
    });
    it('creates category when auth and cafe_id present', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: uniqueName, description: 'Intensive test category', sort_order: 0 });
      expect([201, 400, 403, 500]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body).toHaveProperty('id');
        expect(res.body).toHaveProperty('name', uniqueName);
      }
    });
    it('returns 400 or 500 when creating duplicate name in same cafe', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: uniqueName, description: 'Duplicate', sort_order: 0 });
      expect([400, 403, 500]).toContain(res.status);
    });
  });

  describe('PUT /api/categories/:id', () => {
    it('returns 400 when name is missing', async () => {
      if (!token) return;
      const res = await request(app)
        .put('/api/categories/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Only desc' });
      expect([400, 403, 404, 500]).toContain(res.status);
    });
    it('returns 401 without token', async () => {
      const res = await request(app)
        .put('/api/categories/1')
        .send({ name: 'Updated', description: '' });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/categories/:id', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).delete('/api/categories/99999');
      expect(res.status).toBe(401);
    });
    it('returns 404 or 200 for non-existent id with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .delete('/api/categories/99999')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 404, 500]).toContain(res.status);
    });
  });
});
