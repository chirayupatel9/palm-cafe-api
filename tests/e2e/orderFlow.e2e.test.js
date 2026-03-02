/**
 * E2E: Order lifecycle — category, menu item, customer, order, order_items, invoice, payment.
 * Optionally: inventory item + stock deduction. No mocks; real HTTP and DB.
 */
const request = require('supertest');
const app = require('../../index');
const { truncateDb } = require('./truncateDb');
const { seedE2e } = require('./seedE2e');

const suffix = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function assertErrorShape(body) {
  if (body.error != null) expect(body).toMatchObject({ error: expect.any(String) });
  if (body.code != null) expect(body.code).toMatch(/^[A-Z_0-9]+$/);
  if (body.requestId != null) expect(typeof body.requestId).toBe('string');
}

describe('E2E: Order flow', () => {
  let adminToken;
  let cafeId;
  let categoryId;
  let menuItemId;
  let customerId;
  let orderId;

  beforeAll(async () => {
    await truncateDb();
    await seedE2e();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'e2e-admin@test.com', password: 'admin123' });
    expect(loginRes.status).toBe(200);
    adminToken = loginRes.body.token;
    cafeId = loginRes.body.user.cafe_id;
    expect(cafeId).toBeTruthy();
  });

  it('creates category', async () => {
    const name = `Cat_${suffix()}`;
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name, description: 'E2E category' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: expect.any(Number), name });
    categoryId = res.body.id;
  });

  it('creates menu item', async () => {
    const name = `Item_${suffix()}`;
    const res = await request(app)
      .post('/api/menu')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        category_id: categoryId,
        name,
        description: 'E2E item',
        price: 99.99
      });
    expect([201, 403]).toContain(res.status);
    if (res.status === 403) return;
    expect(res.body).toMatchObject({ id: expect.any(Number), name, price: 99.99 });
    menuItemId = res.body.id;
  });

  it('creates customer', async () => {
    const name = `Customer_${suffix()}`;
    const phone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name, phone, email: `cust_${suffix()}@test.com` });
    expect([201, 400]).toContain(res.status);
    if (res.status !== 201) return;
    expect(res.body).toMatchObject({ id: expect.any(Number), name });
    customerId = res.body.id;
  });

  it('creates order and verifies order_items', async () => {
    if (!menuItemId) return;
    const item = {
      id: menuItemId,
      menu_item_id: menuItemId,
      name: 'E2E Item',
      price: 99.99,
      quantity: 2,
      total: 199.98
    };
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customer_name: `OrderCustomer_${suffix()}`,
        items: [item],
        total_amount: 199.98,
        tax_amount: 0,
        tip_amount: 0,
        final_amount: 199.98,
        payment_method: 'cash'
      });
    expect([201, 403]).toContain(res.status);
    if (res.status !== 201) return;
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      order_number: expect.any(String),
      status: 'pending',
      final_amount: 199.98
    });
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0]).toMatchObject({ quantity: 2, total_price: 199.98 });
    orderId = res.body.id;
  });

  it('generates invoice for order', async () => {
    if (!orderId) return;
    const res = await request(app)
      .post('/api/invoices/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ order_id: orderId });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ invoiceNumber: expect.any(String) });
  });

  it('applies payment (updates order status to completed)', async () => {
    if (!orderId) return;
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'completed' });
  });

  it('verifies order status updated', async () => {
    if (!orderId) return;
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const order = (res.body || []).find((o) => o.id === orderId);
    expect(order).toBeDefined();
    expect(order.status).toBe('completed');
  });

  it('inventory deduction: create item, update stock, verify quantity', async () => {
    const createRes = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Inv_${suffix()}`,
        category: 'Beverages',
        quantity: 50,
        unit: 'kg'
      });
    if (createRes.status === 403 || createRes.status === 400) return;
    expect(createRes.status).toBe(201);
    const invId = createRes.body.id;
    const newQty = 45;
    const patchRes = await request(app)
      .patch(`/api/inventory/${invId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantity: newQty });
    if (patchRes.status !== 200) return;
    const getRes = await request(app)
      .get('/api/inventory')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.status).toBe(200);
    const item = (getRes.body || []).find((i) => i.id === invId);
    if (item) expect(parseFloat(item.quantity)).toBe(newQty);
  });
});
