const request = require('supertest');
const app = require('../index');

describe('Orders', () => {
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
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@cafe.com', password: 'admin123' });
      const token = loginRes.body.token;
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ total_amount: 10 })
        .expect(400);
      expect(res.body).toHaveProperty('error');
    });

    it('creates order when authenticated with cafe and valid payload', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@cafe.com', password: 'admin123' });
      const token = loginRes.body.token;
      const user = loginRes.body.user;
      if (!user.cafe_id) {
        return;
      }
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
        })
        .expect(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('order_number');
      expect(res.body).toHaveProperty('status');
    });
  });
});
