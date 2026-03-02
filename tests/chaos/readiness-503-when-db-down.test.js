/**
 * Chaos: Simulate DB unavailable. Readiness must return 503, server must not crash.
 */
jest.mock('../../config/database', () => ({
  pool: {},
  testConnection: jest.fn().mockResolvedValue(false),
  initializeDatabase: jest.fn()
}));

const request = require('supertest');
process.env.NODE_ENV = 'test';
const app = require('../../index');

describe('Chaos: Readiness when DB down', () => {
  it('returns 503 when database is unavailable', async () => {
    const res = await request(app).get('/api/readiness');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      ready: false,
      database: expect.stringMatching(/disconnected|unknown/)
    });
  });
});
