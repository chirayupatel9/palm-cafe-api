/**
 * Chaos: Force internal exception and verify global error handler format.
 * Response must be { error, code, requestId }. Server must not crash.
 */
const request = require('supertest');

// Load app with test chaos route (registered only when NODE_ENV=test)
process.env.NODE_ENV = 'test';
const app = require('../../index');

describe('Chaos: Global error handler', () => {
  it('returns 500 with error, code, requestId on unhandled exception', async () => {
    const res = await request(app)
      .get('/api/chaos/throw')
      .set('X-Request-ID', 'chaos-req-1');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      error: expect.any(String),
      code: expect.stringMatching(/^[A-Z_0-9]+$/),
      requestId: 'chaos-req-1'
    });
    expect(res.body.error).toBeTruthy();
  });
});
