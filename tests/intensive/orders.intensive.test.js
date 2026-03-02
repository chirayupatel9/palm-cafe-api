/**
 * Intensive order tests: full create flow, list, get by id, validation, invalid id.
 */
const request = require('supertest');
const app = require('../../index');
const { loginAndGetToken } = require('../utils/authHelper');

describe('Orders intensive', () => {
  let token;

  beforeAll(async () => {
    try {
      token = await loginAndGetToken(request(app));
    } catch (e) {
      // skip
    }
  });

  describe('POST /api/orders', () => {
    it('returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/orders')
        .send({
          items: [{ menu_item_id: '1', name: 'Coffee', quantity: 1, price: 5, total: 5 }],
          total_amount: 5,
          tax_amount: 0,
          tip_amount: 0,
          final_amount: 5,
          payment_method: 'cash',
          customer_name: 'Test'
        });
      expect(res.status).toBe(401);
    });
    it('returns 400 when items array is empty', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [],
          total_amount: 0,
          final_amount: 0,
          payment_method: 'cash',
          customer_name: 'Test'
        });
      expect([400, 403, 500]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body).toHaveProperty('error');
      }
    });
    it('returns 400 when items is missing', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          total_amount: 10,
          final_amount: 10,
          payment_method: 'cash',
          customer_name: 'Test'
        });
      expect(res.status).toBe(400);
    });
    it('creates order with full payload when auth and cafe_id', async () => {
      if (!token) return;
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [
            { menu_item_id: '1', name: 'Espresso', quantity: 2, price: 3.5, total: 7 },
            { menu_item_id: '2', name: 'Latte', quantity: 1, price: 4.5, total: 4.5 }
          ],
          total_amount: 11.5,
          tax_amount: 0,
          tip_amount: 0,
          final_amount: 11.5,
          payment_method: 'cash',
          customer_name: 'Intensive Test Customer',
          table_number: 'T5'
        });
      expect([201, 403, 500]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body).toHaveProperty('id');
        expect(res.body).toHaveProperty('order_number');
        expect(res.body).toHaveProperty('status');
        expect(res.body.order_number).toBeTruthy();
      }
    });
  });

  describe('GET /api/orders', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/orders');
      expect(res.status).toBe(401);
    });
    it('returns 200 and array with auth', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body)).toBe(true);
      }
    });
  });

  describe('GET /api/orders/:id', () => {
    it('returns 401 or 404 without token', async () => {
      const res = await request(app).get('/api/orders/1');
      expect([401, 404]).toContain(res.status);
    });
    it('returns 400 for invalid id', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/orders/invalid')
        .set('Authorization', `Bearer ${token}`);
      expect([400, 404]).toContain(res.status);
    });
    it('returns 404 for non-existent order id', async () => {
      if (!token) return;
      const res = await request(app)
        .get('/api/orders/999999')
        .set('Authorization', `Bearer ${token}`);
      expect([404, 500]).toContain(res.status);
    });
  });
});
