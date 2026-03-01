/**
 * Unit tests for lib/metrics (in-memory counters).
 */
const {
  getCounts,
  incrementRequestCount,
  incrementErrorCount,
  resetCounts
} = require('../../../lib/metrics');

describe('lib/metrics', () => {
  beforeEach(() => {
    resetCounts();
  });

  describe('getCounts', () => {
    it('returns initial zeros', () => {
      expect(getCounts()).toEqual({ requestCount: 0, errorCount: 0 });
    });
  });

  describe('incrementRequestCount', () => {
    it('increments request count', () => {
      incrementRequestCount();
      expect(getCounts().requestCount).toBe(1);
      incrementRequestCount();
      incrementRequestCount();
      expect(getCounts().requestCount).toBe(3);
    });
  });

  describe('incrementErrorCount', () => {
    it('increments error count', () => {
      incrementErrorCount();
      expect(getCounts().errorCount).toBe(1);
      incrementErrorCount();
      expect(getCounts().errorCount).toBe(2);
    });
  });

  describe('resetCounts', () => {
    it('resets both counts to zero', () => {
      incrementRequestCount();
      incrementErrorCount();
      resetCounts();
      expect(getCounts()).toEqual({ requestCount: 0, errorCount: 0 });
    });
  });
});
