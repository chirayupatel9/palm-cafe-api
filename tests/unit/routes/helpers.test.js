/**
 * Unit tests for routes/helpers (getOrderCafeId, parseInventoryId, validateQuantity, etc.).
 */
const {
  getOrderCafeId,
  getInventoryCafeId,
  parseInventoryId,
  validateQuantity,
  INVENTORY_LIMITS,
  validateInventoryStrings,
  parseListLimitOffset,
  MAX_LIST_LIMIT
} = require('../../../routes/helpers');

describe('routes/helpers', () => {
  describe('getOrderCafeId', () => {
    it('returns null when req.user is missing', () => {
      expect(getOrderCafeId({})).toBeNull();
      expect(getOrderCafeId({ user: null })).toBeNull();
    });
    it('returns user.cafe_id when no impersonation', () => {
      expect(getOrderCafeId({ user: { cafe_id: 5 } })).toBe(5);
    });
    it('returns impersonation cafeId when impersonating', () => {
      const req = {
        user: { cafe_id: 1 },
        impersonation: { isImpersonating: true, cafeId: 10 }
      };
      expect(getOrderCafeId(req)).toBe(10);
    });
    it('uses query.cafeId for superadmin when valid integer', () => {
      const req = { user: { role: 'superadmin' }, query: { cafeId: '7' } };
      expect(getOrderCafeId(req)).toBe(7);
    });
    it('ignores invalid query.cafeId', () => {
      expect(getOrderCafeId({ user: { role: 'superadmin' }, query: { cafeId: 'x' } })).toBeNull();
      expect(getOrderCafeId({ user: { role: 'superadmin' }, query: { cafeId: '0' } })).toBeNull();
    });
  });

  describe('getInventoryCafeId', () => {
    it('returns null when req.user is missing', () => {
      expect(getInventoryCafeId({})).toBeNull();
    });
    it('returns user.cafe_id when set', () => {
      expect(getInventoryCafeId({ user: { cafe_id: 3 } })).toBe(3);
    });
  });

  describe('parseInventoryId', () => {
    it('returns invalid for null, empty, non-integer', () => {
      expect(parseInventoryId(null).valid).toBe(false);
      expect(parseInventoryId('').valid).toBe(false);
      expect(parseInventoryId('x').valid).toBe(false);
      expect(parseInventoryId('0').valid).toBe(false);
      expect(parseInventoryId('-1').valid).toBe(false);
    });
    it('returns valid and value for positive integer', () => {
      const r = parseInventoryId('42');
      expect(r.valid).toBe(true);
      expect(r.value).toBe(42);
    });
  });

  describe('validateQuantity', () => {
    it('returns invalid for missing or negative', () => {
      expect(validateQuantity(undefined).valid).toBe(false);
      expect(validateQuantity(null).valid).toBe(false);
      expect(validateQuantity('').valid).toBe(false);
      expect(validateQuantity(-1).valid).toBe(false);
      expect(validateQuantity(NaN).valid).toBe(false);
    });
    it('returns valid for non-negative number', () => {
      expect(validateQuantity(0).valid).toBe(true);
      expect(validateQuantity(0).value).toBe(0);
      expect(validateQuantity(5).value).toBe(5);
      expect(validateQuantity('10').value).toBe(10);
    });
  });

  describe('validateInventoryStrings', () => {
    it('returns valid for empty or within limits', () => {
      expect(validateInventoryStrings({})).toEqual({ valid: true });
      expect(validateInventoryStrings({ name: 'a'.repeat(200) })).toEqual({ valid: true });
    });
    it('returns invalid when name exceeds limit', () => {
      const r = validateInventoryStrings({ name: 'a'.repeat(201) });
      expect(r.valid).toBe(false);
      expect(r.error).toContain('Name');
    });
    it('returns invalid when category exceeds limit', () => {
      const r = validateInventoryStrings({ category: 'a'.repeat(101) });
      expect(r.valid).toBe(false);
      expect(r.error).toContain('Category');
    });
  });

  describe('parseListLimitOffset', () => {
    it('defaults limit to null and offset to 0 for invalid query', () => {
      expect(parseListLimitOffset({ query: {} })).toEqual({ limit: null, offset: 0 });
      expect(parseListLimitOffset({ query: { limit: 'x', offset: 'y' } })).toEqual({ limit: null, offset: 0 });
    });
    it('caps limit at MAX_LIST_LIMIT', () => {
      const req = { query: { limit: '999', offset: '0' } };
      expect(parseListLimitOffset(req).limit).toBe(MAX_LIST_LIMIT);
    });
    it('parses valid limit and offset', () => {
      expect(parseListLimitOffset({ query: { limit: '10', offset: '5' } })).toEqual({ limit: 10, offset: 5 });
    });
    it('uses 0 for negative offset', () => {
      expect(parseListLimitOffset({ query: { limit: '5', offset: '-1' } }).offset).toBe(0);
    });
  });
});
