/**
 * Lightweight concurrency test: 10 parallel requests to /api/menu and /api/health.
 * Ensures no crashes and all complete with 200.
 */
const request = require('supertest');
const app = require('../../index');

const CONCURRENCY = 10;

describe('Performance sanity', () => {
  it('handles 10 parallel GET /api/menu without crash', async () => {
    const promises = Array.from({ length: CONCURRENCY }, () =>
      request(app).get('/api/menu')
    );
    const results = await Promise.all(promises);
    expect(results).toHaveLength(CONCURRENCY);
    results.forEach((res) => {
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  it('handles 10 parallel GET /api/health without crash', async () => {
    const promises = Array.from({ length: CONCURRENCY }, () =>
      request(app).get('/api/health')
    );
    const results = await Promise.all(promises);
    expect(results).toHaveLength(CONCURRENCY);
    results.forEach((res) => {
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('database');
    });
  });
});
