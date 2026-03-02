/**
 * Stress: Concurrent order creation. Validates no negative totals, transaction rollback, consistency.
 * Uses real app and test DB. High concurrency.
 */
const request = require('supertest');
const app = require('../../index');
const { pool } = require('../../config/database');
const { truncateDb } = require('../e2e/truncateDb');
const { seedE2e } = require('../e2e/seedE2e');
const { seedBrowserMenu } = require('../e2e/seedBrowserMenu');

const CONCURRENCY = 30;
const BASE_URL = '';

function getToken() {
  return request(app)
    .post(BASE_URL + '/api/auth/login')
    .send({ email: 'e2e-admin@test.com', password: 'admin123' })
    .then((res) => (res.status === 200 ? res.body.token : null));
}

async function getFirstMenuItemId() {
  const [rows] = await pool.execute('SELECT id FROM menu_items WHERE cafe_id = 1 OR cafe_id IS NULL LIMIT 1');
  return rows[0] ? rows[0].id : null;
}

jest.setTimeout(45000);

describe('Stress: Concurrent orders', () => {
  let token;
  let menuItemId;

  beforeAll(async () => {
    await truncateDb();
    await seedE2e();
    await seedBrowserMenu();
    token = await getToken();
    menuItemId = await getFirstMenuItemId();
    expect(token).toBeTruthy();
    expect(menuItemId).toBeTruthy();
  }, 20000);

  it('creates many orders concurrently; no negative totals, transactions consistent', async () => {
    const payload = (i) => ({
      customer_name: 'Stress-' + i,
      items: [{ id: 1, menu_item_id: menuItemId, name: 'Item', price: 10, quantity: 1, total: 10 }],
      total_amount: 10,
      tax_amount: 0,
      tip_amount: 0,
      final_amount: 10,
      payment_method: 'cash'
    });

    const promises = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      promises.push(
        request(app)
          .post(BASE_URL + '/api/orders')
          .set('Authorization', 'Bearer ' + token)
          .send(payload(i))
      );
    }
    const results = await Promise.all(promises);

    const created = results.filter((r) => r.status === 201);
    const failed = results.filter((r) => r.status !== 201);
    expect(failed.every((r) => r.status >= 400 && r.status < 600)).toBe(true);
    expect(created.length).toBeGreaterThan(0);

    const [orderRows] = await pool.execute(
      'SELECT id, total_amount, final_amount FROM orders WHERE customer_name LIKE ? ORDER BY id',
      ['Stress-%']
    );
    expect(orderRows.length).toBe(created.length);
    for (const row of orderRows) {
      expect(Number(row.total_amount)).toBeGreaterThanOrEqual(0);
      expect(Number(row.final_amount)).toBeGreaterThanOrEqual(0);
    }

    const [itemRows] = await pool.execute(
      'SELECT oi.order_id, oi.quantity, oi.total_price FROM order_items oi INNER JOIN orders o ON oi.order_id = o.id WHERE o.customer_name LIKE ?',
      ['Stress-%']
    );
    expect(itemRows.length).toBe(orderRows.length);
    for (const row of itemRows) {
      expect(Number(row.quantity)).toBeGreaterThanOrEqual(0);
      expect(Number(row.total_price)).toBeGreaterThanOrEqual(0);
    }
  }, 40000);
});
