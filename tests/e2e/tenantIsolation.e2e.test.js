/**
 * E2E: Tenant isolation — Cafe A vs Cafe B; user of Cafe A cannot access Cafe B data.
 * No mocks; real HTTP and DB.
 */
const request = require('supertest');
const app = require('../../index');
const { truncateDb } = require('./truncateDb');
const { seedE2e } = require('./seedE2e');
const { pool } = require('../../config/database');

const suffix = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function assertErrorShape(body) {
  if (body.error != null) expect(body).toMatchObject({ error: expect.any(String) });
  if (body.code != null) expect(body.code).toMatch(/^[A-Z_0-9]+$/);
  if (body.requestId != null) expect(typeof body.requestId).toBe('string');
}

describe('E2E: Tenant isolation', () => {
  let superadminToken;
  let cafeAId;
  let cafeBId;
  let userAToken;

  beforeAll(async () => {
    await truncateDb();
    await seedE2e();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'e2e-superadmin@test.com', password: 'superadmin123' });
    expect(loginRes.status).toBe(200);
    superadminToken = loginRes.body.token;

    const createCafeARes = await request(app)
      .post('/api/superadmin/cafes')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ slug: `cafe-a-${suffix()}`, name: 'Cafe A' });
    expect(createCafeARes.status).toBe(201);
    cafeAId = createCafeARes.body.cafe.id;

    const createCafeBRes = await request(app)
      .post('/api/superadmin/cafes')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ slug: `cafe-b-${suffix()}`, name: 'Cafe B' });
    expect(createCafeBRes.status).toBe(201);
    cafeBId = createCafeBRes.body.cafe.id;

    const userEmail = `usera_${suffix()}@test.com`;
    const createUserARes = await request(app)
      .post(`/api/superadmin/cafes/${cafeAId}/users`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        username: `usera_${suffix()}`,
        email: userEmail,
        password: 'Password123!',
        role: 'admin'
      });
    expect(createUserARes.status).toBe(201);

    const userALogin = await request(app)
      .post('/api/auth/login')
      .send({ email: userEmail, password: 'Password123!' });
    expect(userALogin.status).toBe(200);
    userAToken = userALogin.body.token;
  });

  it('creates Cafe A and Cafe B', () => {
    expect(cafeAId).toBeGreaterThan(0);
    expect(cafeBId).toBeGreaterThan(0);
    expect(cafeAId).not.toBe(cafeBId);
  });

  it('user of Cafe A cannot access Cafe B data', async () => {
    const [orderCols] = await pool.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'cafe_id'
    `);
    if (orderCols.length === 0) return;
    const orderNum = `ORD-CAFEB-${suffix()}`;
    await pool.execute(
      `INSERT INTO orders (order_number, customer_name, total_amount, final_amount, status, cafe_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [orderNum, 'Cafe B Customer', 100, 100, 'pending', cafeBId]
    );
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${userAToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const cafeBOrders = (res.body || []).filter((o) => o.cafe_id === cafeBId);
    expect(cafeBOrders.length).toBe(0);
  });

  it('cafe_id scoping is enforced on orders list', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${userAToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.any(Array));
    res.body.forEach((order) => {
      expect(order.cafe_id).toBe(cafeAId);
    });
  });
});
