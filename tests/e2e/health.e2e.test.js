/**
 * E2E: Health and readiness — GET /api/health 200, GET /api/readiness 200.
 * Readiness 503 when DB unavailable: run last and close pool after 200 checks.
 * No mocks; real HTTP.
 */
const request = require('supertest');
const app = require('../../index');
const { truncateDb } = require('./truncateDb');
const { seedE2e } = require('./seedE2e');

function assertErrorShape(body) {
  if (body.error != null) expect(body).toMatchObject({ error: expect.any(String) });
  if (body.code != null) expect(body.code).toMatch(/^[A-Z_0-9]+$/);
  if (body.requestId != null) expect(typeof body.requestId).toBe('string');
}

describe('E2E: Health', () => {
  beforeAll(async () => {
    await truncateDb();
    await seedE2e();
  });

  it('GET /api/health returns 200 when DB connected', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'OK',
      database: 'connected',
      uptime: expect.any(Number)
    });
    if (res.body.requestId) expect(typeof res.body.requestId).toBe('string');
  });

  it('GET /api/readiness returns 200 when DB connected', async () => {
    const res = await request(app).get('/api/readiness');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ready: true,
      database: 'connected'
    });
    if (res.body.requestId) expect(typeof res.body.requestId).toBe('string');
  });

  it('error response shape includes error, code, requestId when present', async () => {
    const res = await request(app).get('/api/nonexistent-route');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.any(String), code: 'NOT_FOUND' });
    if (res.body.requestId) expect(typeof res.body.requestId).toBe('string');
  });
});
