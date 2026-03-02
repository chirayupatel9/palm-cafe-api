/**
 * Unit tests for validateInput middleware helpers.
 */
const {
  isMalformedString,
  sanitizeString,
  parsePositiveId,
  validateRequiredString
} = require('../../../middleware/validateInput');

describe('validateInput', () => {
  describe('isMalformedString', () => {
    it('returns true for null and undefined', () => {
      expect(isMalformedString(null)).toBe(true);
      expect(isMalformedString(undefined)).toBe(true);
    });
    it('returns true for empty string and whitespace', () => {
      expect(isMalformedString('')).toBe(true);
      expect(isMalformedString('   ')).toBe(true);
    });
    it('returns true for literal "undefined" and "null"', () => {
      expect(isMalformedString('undefined')).toBe(true);
      expect(isMalformedString('null')).toBe(true);
      expect(isMalformedString('  undefined  ')).toBe(true);
    });
    it('returns false for valid strings', () => {
      expect(isMalformedString('hello')).toBe(false);
      expect(isMalformedString('0')).toBe(false);
      expect(isMalformedString('123')).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    it('returns null for null, undefined, empty, malformed', () => {
      expect(sanitizeString(null)).toBeNull();
      expect(sanitizeString(undefined)).toBeNull();
      expect(sanitizeString('')).toBeNull();
      expect(sanitizeString('undefined')).toBeNull();
    });
    it('returns trimmed string for valid value', () => {
      expect(sanitizeString('  foo  ')).toBe('foo');
      expect(sanitizeString('bar')).toBe('bar');
    });
  });

  describe('parsePositiveId', () => {
    it('returns null for null, undefined, empty, malformed', () => {
      expect(parsePositiveId(null)).toBeNull();
      expect(parsePositiveId(undefined)).toBeNull();
      expect(parsePositiveId('')).toBeNull();
      expect(parsePositiveId('undefined')).toBeNull();
      expect(parsePositiveId('abc')).toBeNull();
      expect(parsePositiveId('0')).toBeNull();
      expect(parsePositiveId('-1')).toBeNull();
    });
    it('returns number for valid positive id', () => {
      expect(parsePositiveId('1')).toBe(1);
      expect(parsePositiveId('  42  ')).toBe(42);
      expect(parsePositiveId(99)).toBe(99);
    });
  });

  describe('validateRequiredString', () => {
    it('returns error message for malformed value', () => {
      expect(validateRequiredString(null, 'name')).toContain('required');
      expect(validateRequiredString('', 'email')).toContain('required');
      expect(validateRequiredString('undefined', 'id')).toContain('required');
    });
    it('returns null for valid value', () => {
      expect(validateRequiredString('ok', 'name')).toBeNull();
      expect(validateRequiredString('  x  ', 'field')).toBeNull();
    });
  });
});
