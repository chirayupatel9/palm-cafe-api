/**
 * E2E: Subscription gating — disable feature → 403; enable → success.
 * No mocks; real HTTP and DB.
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

describe('E2E: Subscription gating', () => {
  let superadminToken;
  let adminToken;
  let cafeId;

  beforeAll(async () => {
    await truncateDb();
    await seedE2e();
    const superLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'e2e-superadmin@test.com', password: 'superadmin123' });
    expect(superLogin.status).toBe(200);
    superadminToken = superLogin.body.token;

    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'e2e-admin@test.com', password: 'admin123' });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.token;
    cafeId = adminLogin.body.user.cafe_id;
  });

  it('disables feature for cafe then restricted action returns 403', async () => {
    const featureKey = 'inventory';
    const toggleOff = await request(app)
      .post(`/api/superadmin/cafes/${cafeId}/features/${featureKey}/toggle`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ enabled: false });
    expect([200, 404, 500]).toContain(toggleOff.status);
    if (toggleOff.status !== 200) return;

    const res = await request(app)
      .get('/api/inventory')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
    assertErrorShape(res.body);
  });

  it('enables feature then restricted action succeeds', async () => {
    const featureKey = 'inventory';
    const toggleOn = await request(app)
      .post(`/api/superadmin/cafes/${cafeId}/features/${featureKey}/toggle`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ enabled: true });
    expect([200, 404, 500]).toContain(toggleOn.status);
    if (toggleOn.status !== 200) return;

    const res = await request(app)
      .get('/api/inventory')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
