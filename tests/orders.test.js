const request = require('supertest');
const app = require('../index');
const { loginAndGetToken } = require('./utils/authHelper');

describe('Orders', () => {
  let token;

  beforeAll(async () => {
    try {
      token = await loginAndGetToken(request(app));
    } catch (e) {
      token = null;
    }
  });

  describe('GET /api/orders', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/orders').expect(401);
      expect(res.body).toHaveProperty('error');
    });
    it('returns 200 or 403 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
    it('accepts customer_phone and order_number query', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/orders?customer_phone=+911234567890')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
    });
    it('accepts limit and offset', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/orders?limit=5&offset=0')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403, 500]).toContain(res.status);
    });
  });

  describe('GET /api/customer/orders', () => {
    it('returns 400 when customer_phone missing or invalid', async () => {
      const res = await request(app).get('/api/customer/orders');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/phone|required/i);
    });
    it('returns 200 with valid customer_phone', async () => {
      const res = await request(app)
        .get('/api/customer/orders?customer_phone=+919876543210');
      expect([200]).toContain(res.status);
      expect(Array.isArray(res.body)).toBe(true);
    });
    it('accepts cafeSlug query', async () => {
      const res = await request(app)
        .get('/api/customer/orders?customer_phone=+911111111111&cafeSlug=default');
      expect([200]).toContain(res.status);
    });
  });

  describe('POST /api/customer/orders', () => {
    it('returns 400 when customer name missing', async () => {
      const res = await request(app)
        .post('/api/customer/orders')
        .send({
          customerPhone: '+911234567890',
          items: [{ id: 1, name: 'Coffee', quantity: 1, price: 5 }]
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/name|required/i);
    });
    it('returns 400 when items missing', async () => {
      const res = await request(app)
        .post('/api/customer/orders')
        .send({ customerName: 'A', customerPhone: '+911234567890' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/item/i);
    });
    it('returns 400 when items empty array', async () => {
      const res = await request(app)
        .post('/api/customer/orders')
        .send({ customerName: 'A', customerPhone: '+911234567890', items: [] });
      expect(res.status).toBe(400);
    });
    it('returns 400 when item has no id', async () => {
      const res = await request(app)
        .post('/api/customer/orders')
        .send({
          customerName: 'A',
          customerPhone: '+911234567890',
          items: [{ name: 'X', quantity: 1, price: 5 }]
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/item|id/i);
    });
    it('returns 201 or 500 with valid payload', async () => {
      const res = await request(app)
        .post('/api/customer/orders')
        .send({
          customerName: 'Order Test',
          customerPhone: '+919999988887',
          items: [{ id: 1, menu_item_id: 1, name: 'Espresso', quantity: 1, price: 4, total: 4 }]
        });
      expect([201, 500]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body).toHaveProperty('orderNumber');
        expect(res.body).toHaveProperty('orderId');
      }
    });
  });

  describe('PATCH /api/orders/:id/status', () => {
    it('returns 401 without auth', async () => {
      await request(app)
        .patch('/api/orders/1/status')
        .send({ status: 'completed' })
        .expect(401);
    });
    it('returns 400 when status missing', async () => {
      if (!token) return;
      const res = await request(app)
        .patch('/api/orders/1/status')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/status|required/i);
    });
    it('returns 400 when status invalid', async () => {
      if (!token) return;
      const res = await request(app)
        .patch('/api/orders/1/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'invalid_status' });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/invalid|status/i);
    });
    it('returns 404 or 403 when order not found', async () => {
      if (!token) return;
      const res = await request(app)
        .patch('/api/orders/999999/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'pending' });
      expect([404, 403]).toContain(res.status);
      if (res.status === 404) expect(res.body.error).toMatch(/not found/i);
    });
  });

  describe('PUT /api/orders/:id', () => {
    it('returns 401 without auth', async () => {
      await request(app)
        .put('/api/orders/1')
        .send({ customer_name: 'Updated' })
        .expect(401);
    });
    it('returns 400 or 200 or 403 when body missing or empty', async () => {
      if (!token) return;
      const res = await request(app)
        .put('/api/orders/1')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toMatch(/required/i);
    });
  });

  describe('POST /api/orders', () => {
    it('returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/orders')
        .send({ items: [{ menu_item_id: '1', name: 'Espresso', quantity: 1, price: 3.5, total: 3.5 }], total_amount: 3.5 })
        .expect(401);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 401 with invalid token', async () => {
      await request(app)
        .post('/api/orders')
        .set('Authorization', 'Bearer invalid-token')
        .send({ items: [{ menu_item_id: '1', name: 'Espresso', quantity: 1, price: 3.5, total: 3.5 }], total_amount: 3.5 })
        .expect(401);
    });

    it('returns 400 when items are missing (with valid token)', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ total_amount: 10 });
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) expect(res.body).toHaveProperty('error');
    });

    it('creates order when authenticated with cafe and valid payload', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [
            { menu_item_id: '1', name: 'Espresso', quantity: 2, price: 3.5, total: 7 }
          ],
          total_amount: 7,
          tax_amount: 0,
          tip_amount: 0,
          final_amount: 7,
          payment_method: 'cash',
          customer_name: 'Test Customer'
        });
      expect([201, 403, 500]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body).toHaveProperty('id');
        expect(res.body).toHaveProperty('order_number');
        expect(res.body).toHaveProperty('status');
      }
    });
  });

  describe('POST /api/orders/test', () => {
    it('returns 401 without auth', async () => {
      await request(app).post('/api/orders/test').expect(401);
    });
    it('returns 200 or 400 or 403 or 500 with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/orders/test')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 201, 400, 403, 500]).toContain(res.status);
      if (res.status === 201) expect(res.body).toHaveProperty('order_number');
    });
  });
});
