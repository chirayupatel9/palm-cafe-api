/**
 * Unit tests for rateLimiter middleware exports.
 */
const rateLimiter = require('../../../middleware/rateLimiter');

describe('rateLimiter', () => {
  it('exports generalLimiter as function', () => {
    expect(rateLimiter.generalLimiter).toBeDefined();
    expect(typeof rateLimiter.generalLimiter).toBe('function');
  });
  it('exports authLimiter as function', () => {
    expect(rateLimiter.authLimiter).toBeDefined();
    expect(typeof rateLimiter.authLimiter).toBe('function');
  });
  it('exports uploadLimiter as function', () => {
    expect(rateLimiter.uploadLimiter).toBeDefined();
    expect(typeof rateLimiter.uploadLimiter).toBe('function');
  });
  it('exports apiLimiter as function', () => {
    expect(rateLimiter.apiLimiter).toBeDefined();
    expect(typeof rateLimiter.apiLimiter).toBe('function');
  });
});
