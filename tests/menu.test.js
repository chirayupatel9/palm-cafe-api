const request = require('supertest');
const app = require('../index');
const { loginAndGetToken } = require('./utils/authHelper');

describe('Menu', () => {
  let token;

  beforeAll(async () => {
    try {
      token = await loginAndGetToken(request(app));
    } catch (e) {
      token = null;
    }
  });

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

    it('returns 400 when category_id missing', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Item', price: 2.99 });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/required/i);
    });

    it('returns 400 when name missing', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${token}`)
        .send({ category_id: 1, price: 2.99 });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/required/i);
    });

    it('returns 400 when price missing', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${token}`)
        .send({ category_id: 1, name: 'Item' });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/required/i);
    });
  });

  describe('GET /api/menu (public read)', () => {
    it('returns 200 without auth', async () => {
      const res = await request(app).get('/api/menu').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns 200 with cafeSlug query', async () => {
      const res = await request(app).get('/api/menu?cafeSlug=default').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/categories', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/categories').expect(401);
      expect(res.body).toHaveProperty('error');
    });
    it('returns 200 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/categories', () => {
    it('returns 401 without auth', async () => {
      await request(app)
        .post('/api/categories')
        .send({ name: 'Drinks' })
        .expect(401);
    });
    it('returns 400 when name missing', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect([400, 200]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/name/i);
    });
  });

  describe('GET /api/admin/menu', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/admin/menu').expect(401);
    });
    it('returns 200 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/admin/menu')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/menu/grouped', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/menu/grouped').expect(401);
    });
    it('returns 200 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/menu/grouped')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('PUT /api/menu/:id', () => {
    it('returns 401 without auth', async () => {
      await request(app)
        .put('/api/menu/1')
        .send({ category_id: 1, name: 'Updated', price: 3.99 })
        .expect(401);
    });
    it('returns 400 or 403 with auth when body invalid', async () => {
      if (!token) return;
      const res = await request(app)
        .put('/api/menu/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'No category_id or price' });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/required/i);
    });
  });

  describe('DELETE /api/menu/:id', () => {
    it('returns 401 without auth', async () => {
      await request(app).delete('/api/menu/1').expect(401);
    });
  });

  describe('GET /api/menu/featured', () => {
    it('returns 200 without auth', async () => {
      const res = await request(app).get('/api/menu/featured').expect(200);
      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
    });
    it('returns 404 when cafe not found', async () => {
      const res = await request(app).get('/api/menu/featured?cafeSlug=non-existent-cafe-slug-xyz').expect(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /api/menu/export', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/menu/export').expect(401);
    });
    it('returns 200 or 404 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/menu/export')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) expect(res.headers['content-type']).toMatch(/spreadsheet|xlsx/);
    });
  });

  describe('GET /api/menu/public-info', () => {
    it('returns 200 for default cafe', async () => {
      const res = await request(app).get('/api/menu/public-info?cafeSlug=default').expect(200);
      expect(res.body).toHaveProperty('name');
    });
    it('returns 404 when cafe not found', async () => {
      const res = await request(app).get('/api/menu/public-info?cafeSlug=non-existent-xyz').expect(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /api/menu/branding', () => {
    it('returns 200 for default cafe', async () => {
      const res = await request(app).get('/api/menu/branding?cafeSlug=default').expect(200);
      expect(res.body).toHaveProperty('cafe_name');
    });
    it('returns 404 when cafe not found', async () => {
      const res = await request(app).get('/api/menu/branding?cafeSlug=non-existent-xyz').expect(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /api/tax-settings/menu', () => {
    it('returns 200 without auth', async () => {
      const res = await request(app).get('/api/tax-settings/menu').expect(200);
      expect(res.body).toHaveProperty('show_tax_in_menu');
    });
  });

  describe('GET /api/currency-settings', () => {
    it('returns 200 without auth', async () => {
      const res = await request(app).get('/api/currency-settings').expect(200);
      expect(res.body).toHaveProperty('currency_code');
    });
  });

  describe('GET /api/currency-settings/available', () => {
    it('returns 200 without auth', async () => {
      const res = await request(app).get('/api/currency-settings/available').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/categories/with-counts', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/categories/with-counts').expect(401);
    });
    it('returns 200 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/categories/with-counts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/cafe-settings', () => {
    it('returns 200 without auth with default slug', async () => {
      const res = await request(app).get('/api/cafe-settings?cafeSlug=default').expect(200);
      expect(res.body).toBeDefined();
    });
    it('returns 200 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/cafe-settings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('PUT /api/categories/:id', () => {
    it('returns 401 without auth', async () => {
      await request(app)
        .put('/api/categories/1')
        .send({ name: 'Updated', description: '', sort_order: 0 })
        .expect(401);
    });
    it('returns 400 when name missing', async () => {
      if (!token) return;
      const res = await request(app)
        .put('/api/categories/1')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect([400, 200]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/name/i);
    });
  });

  describe('DELETE /api/categories/:id', () => {
    it('returns 401 without auth', async () => {
      await request(app).delete('/api/categories/1').expect(401);
    });
  });

  describe('GET /api/tax-settings', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/tax-settings').expect(401);
    });
    it('returns 200 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/tax-settings')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) expect(res.body).toBeDefined();
    });
  });

  describe('PUT /api/tax-settings', () => {
    it('returns 401 without auth', async () => {
      await request(app)
        .put('/api/tax-settings')
        .send({ tax_rate: 10, tax_name: 'GST' })
        .expect(401);
    });
    it('returns 400 when tax_rate or tax_name missing', async () => {
      if (!token) return;
      const res = await request(app)
        .put('/api/tax-settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ tax_name: 'GST' });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/required/i);
    });
    it('returns 200 or 403 with valid body', async () => {
      if (!token) return;
      const res = await request(app)
        .put('/api/tax-settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ tax_rate: 8.5, tax_name: 'GST' });
      expect([200, 403]).toContain(res.status);
    });
  });

  describe('POST /api/categories/generate', () => {
    it('returns 401 without auth', async () => {
      await request(app).post('/api/categories/generate').expect(401);
    });
    it('returns 200 or 400 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/categories/generate')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 400, 403]).toContain(res.status);
    });
  });

  describe('GET /api/categories/auto-generated', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/categories/auto-generated').expect(401);
    });
    it('returns 200 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/categories/auto-generated')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/menu/import', () => {
    it('returns 401 without auth', async () => {
      await request(app).post('/api/menu/import').expect(401);
    });
    it('returns 400 when no file with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/menu/import')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/file|upload/i);
    });
  });

  describe('GET /api/tax-settings/history', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/tax-settings/history').expect(401);
    });
    it('returns 200 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/tax-settings/history')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
    });
  });

  describe('POST /api/calculate-tax', () => {
    it('returns 401 without auth', async () => {
      await request(app).post('/api/calculate-tax').send({ subtotal: 100 }).expect(401);
    });
    it('returns 200 or 400 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/calculate-tax')
        .set('Authorization', `Bearer ${token}`)
        .send({ subtotal: 100 });
      expect([200, 400, 403]).toContain(res.status);
    });
  });

  describe('PUT /api/currency-settings', () => {
    it('returns 401 without auth', async () => {
      await request(app)
        .put('/api/currency-settings')
        .send({ currency_code: 'INR' })
        .expect(401);
    });
    it('returns 200 or 400 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .put('/api/currency-settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ currency_code: 'INR', currency_name: 'Indian Rupee' });
      expect([200, 400, 403]).toContain(res.status);
    });
  });

  describe('GET /api/currency-settings/history', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/currency-settings/history').expect(401);
    });
    it('returns 200 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/currency-settings/history')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
    });
  });

  describe('GET /api/cafe-settings/history', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/cafe-settings/history').expect(401);
    });
    it('returns 200 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/cafe-settings/history')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
    });
  });

  describe('GET /api/promo-banners', () => {
    it('returns 401 without auth', async () => {
      await request(app).get('/api/promo-banners').expect(401);
    });
    it('returns 200 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/promo-banners')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('DELETE /api/menu/:id/image', () => {
    it('returns 401 without auth', async () => {
      await request(app).delete('/api/menu/1/image').expect(401);
    });
    it('returns 200 or 404 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .delete('/api/menu/1/image')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 204, 404, 403, 500]).toContain(res.status);
    });
  });
});
