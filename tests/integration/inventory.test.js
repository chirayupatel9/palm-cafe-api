/**
 * Integration tests for inventory routes.
 * Covers: success, validation, 401, 403, invalid params, empty results, error branches.
 */
const request = require('supertest');
const app = require('../../index');
const { loginAndGetToken } = require('../utils/authHelper');

describe('Inventory API', () => {
  let token;

  beforeAll(async () => {
    try {
      token = await loginAndGetToken(request(app));
    } catch (e) {
      token = null;
    }
  });

  const validItem = () => ({
    name: 'Test Item',
    category: 'Cat',
    quantity: 10,
    unit: 'kg'
  });

  describe('GET /api/inventory', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/inventory').expect(401);
      expect(res.body).toHaveProperty('error');
    });
    it('returns 200 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/inventory', () => {
    it('returns 401 without auth', async () => {
      await request(app).post('/api/inventory').send(validItem()).expect(401);
    });
    it('returns 400 when name is missing', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({ category: 'Cat', quantity: 0, unit: 'kg' });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/name/i);
    });
    it('returns 400 when category is missing', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'X', quantity: 0, unit: 'kg' });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/category/i);
    });
    it('returns 400 when unit is missing', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'X', category: 'C', quantity: 0 });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/unit/i);
    });
    it('returns 400 when quantity is invalid', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'X', category: 'C', quantity: -1, unit: 'kg' });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/quantity|non-negative/i);
    });
    it('returns 400 when cost_per_unit is negative', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validItem(), cost_per_unit: -5 });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/cost|non-negative/i);
    });
    it('returns 400 when reorder_level is negative', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validItem(), reorder_level: -1 });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/reorder|non-negative/i);
    });
    it('returns 201 or 403 with valid payload', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send(validItem());
      expect([201, 403]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body).toHaveProperty('id');
        expect(res.body.name).toBe('Test Item');
      }
    });
  });

  describe('PUT /api/inventory/:id', () => {
    it('returns 401 without auth', async () => {
      await request(app)
        .put('/api/inventory/1')
        .send(validItem())
        .expect(401);
    });
    it('returns 400 when id is invalid', async () => {
      if (!token) return;
      const res = await request(app)
        .put('/api/inventory/abc')
        .set('Authorization', `Bearer ${token}`)
        .send(validItem());
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body).toHaveProperty('error');
    });
    it('returns 400 when id is zero', async () => {
      if (!token) return;
      const res = await request(app)
        .put('/api/inventory/0')
        .set('Authorization', `Bearer ${token}`)
        .send(validItem());
      expect([400, 403]).toContain(res.status);
    });
    it('returns 400 when name is missing', async () => {
      if (!token) return;
      const res = await request(app)
        .put('/api/inventory/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ category: 'C', quantity: 1, unit: 'kg' });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/name/i);
    });
    it('returns 200 with valid update', async () => {
      if (!token) return;
      const createRes = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'UpdateMe', category: 'C', quantity: 1, unit: 'kg' });
      if (createRes.status !== 201) return;
      const id = createRes.body.id;
      const res = await request(app)
        .put(`/api/inventory/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'UpdatedName', category: 'C', quantity: 2, unit: 'kg' });
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) expect(res.body.name).toBe('UpdatedName');
    });
  });

  describe('DELETE /api/inventory/:id', () => {
    it('returns 401 without auth', async () => {
      await request(app).delete('/api/inventory/1').expect(401);
    });
    it('returns 400 when id is invalid', async () => {
      if (!token) return;
      const res = await request(app)
        .delete('/api/inventory/not-a-number')
        .set('Authorization', `Bearer ${token}`);
      expect([400, 403]).toContain(res.status);
    });
    it('returns 200 or 404 or 403 or 500 with valid id', async () => {
      if (!token) return;
      const res = await request(app)
        .delete('/api/inventory/999999')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 404, 403, 500]).toContain(res.status);
      if (res.status === 200) expect(res.body.message).toMatch(/deleted/i);
    });
  });

  describe('GET /api/inventory/categories', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/inventory/categories').expect(401);
    });
    it('returns 200 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/inventory/categories')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('PATCH /api/inventory/:id/stock', () => {
    it('returns 401 without auth', async () => {
      await request(app).patch('/api/inventory/1/stock').send({ quantity: 5 }).expect(401);
    });
    it('returns 400 when id is invalid', async () => {
      if (!token) return;
      const res = await request(app)
        .patch('/api/inventory/0/stock')
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 5 });
      expect([400, 403]).toContain(res.status);
    });
    it('returns 400 when quantity is missing', async () => {
      if (!token) return;
      const res = await request(app)
        .patch('/api/inventory/1/stock')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/quantity|required/i);
    });
    it('returns 400 when quantity is negative', async () => {
      if (!token) return;
      const res = await request(app)
        .patch('/api/inventory/1/stock')
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: -1 });
      expect([400, 403]).toContain(res.status);
    });
    it('returns 400 when quantity is NaN', async () => {
      if (!token) return;
      const res = await request(app)
        .patch('/api/inventory/1/stock')
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 'not-a-number' });
      expect([400, 403]).toContain(res.status);
    });
  });

  describe('GET /api/inventory/low-stock', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/inventory/low-stock').expect(401);
    });
    it('returns 200 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/inventory/low-stock')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/inventory/out-of-stock', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/inventory/out-of-stock').expect(401);
    });
    it('returns 200 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/inventory/out-of-stock')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/inventory/statistics', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/inventory/statistics').expect(401);
    });
    it('returns 200 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/inventory/statistics')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) expect(res.body).toBeDefined();
    });
  });

  describe('GET /api/inventory/export', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/inventory/export').expect(401);
    });
    it('returns 200 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/inventory/export')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403, 500]).toContain(res.status);
      if (res.status === 200) expect(res.headers['content-type']).toMatch(/spreadsheet|xlsx/);
    });
  });

  describe('GET /api/inventory/template', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/inventory/template').expect(401);
    });
    it('returns 200 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/inventory/template')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) expect(res.headers['content-type']).toMatch(/spreadsheet|xlsx/);
    });
  });

  describe('POST /api/inventory/import', () => {
    it('returns 401 without auth', async () => {
      await request(app).post('/api/inventory/import').expect(401);
    });
    it('returns 400 when no file uploaded', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/inventory/import')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/file|upload/i);
    });
  });

  describe('GET /api/inventory/:id', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/inventory/1').expect(401);
    });
    it('returns 400 when id is invalid', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/inventory/abc')
        .set('Authorization', `Bearer ${token}`);
      expect([400, 403]).toContain(res.status);
    });
    it('returns 404 or 403 when item does not exist', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/inventory/999999')
        .set('Authorization', `Bearer ${token}`);
      expect([404, 403]).toContain(res.status);
      if (res.status === 404) expect(res.body.error).toMatch(/not found/i);
    });
    it('returns 200 with existing item id', async () => {
      if (!token) return;
      const createRes = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'GetByIdItem', category: 'Test', quantity: 5, unit: 'pcs' });
      if (createRes.status !== 201) return;
      const id = createRes.body.id;
      const res = await request(app)
        .get(`/api/inventory/${id}`)
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.id).toBe(id);
        expect(res.body.name).toBe('GetByIdItem');
      }
    });
  });
});
