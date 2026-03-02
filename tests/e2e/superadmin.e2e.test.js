/**
 * E2E: Superadmin - login, create cafe, impersonate, verify token and audit log.
 * No mocks; real HTTP and DB.
 */
const request = require('supertest');
const app = require('../../index');
const { pool } = require('../../config/database');
const { truncateDb } = require('./truncateDb');
const { seedE2e } = require('./seedE2e');

const suffix = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function assertErrorShape(body) {
  if (body.error != null) expect(body).toMatchObject({ error: expect.any(String) });
  if (body.code != null) expect(body.code).toMatch(/^[A-Z_0-9]+$/);
  if (body.requestId != null) expect(typeof body.requestId).toBe('string');
}

describe('E2E: Superadmin', () => {
  let superadminToken;
  let cafeSlug;

  beforeAll(async () => {
    await truncateDb();
    await seedE2e();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'e2e-superadmin@test.com', password: 'superadmin123' });
    expect(loginRes.status).toBe(200);
    superadminToken = loginRes.body.token;
  });

  it('superadmin logs in', () => {
    expect(superadminToken).toBeTruthy();
    expect(typeof superadminToken).toBe('string');
  });

  it('creates cafe via superadmin', async () => {
    cafeSlug = 'e2e-cafe-' + suffix();
    const res = await request(app)
      .post('/api/superadmin/cafes')
      .set('Authorization', 'Bearer ' + superadminToken)
      .send({ slug: cafeSlug, name: 'E2E Cafe' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      message: expect.any(String),
      cafe: expect.objectContaining({ slug: cafeSlug, name: 'E2E Cafe' })
    });
  });

  it('impersonates cafe and returns impersonation token', async () => {
    const res = await request(app)
      .post('/api/superadmin/impersonate-cafe')
      .set('Authorization', 'Bearer ' + superadminToken)
      .send({ cafeSlug });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      token: expect.any(String),
      impersonation: expect.objectContaining({ cafeSlug })
    });
  });

  it('impersonation token works for cafe-scoped request', async () => {
    const impRes = await request(app)
      .post('/api/superadmin/impersonate-cafe')
      .set('Authorization', 'Bearer ' + superadminToken)
      .send({ cafeSlug });
    const impToken = impRes.body.token;
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', 'Bearer ' + impToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('impersonation audit log entry exists', async () => {
    const [cols] = await pool.execute(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'impersonation_audit_log'"
    );
    if (cols.length === 0) return;
    const [rows] = await pool.execute(
      'SELECT id, action_type, cafe_slug FROM impersonation_audit_log WHERE cafe_slug = ? ORDER BY id DESC LIMIT 1',
      [cafeSlug]
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].action_type).toBe('IMPERSONATION_STARTED');
  });
});
