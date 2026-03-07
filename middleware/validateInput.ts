/**
 * Input validation helpers to reject malformed parameters
 * and reduce risk of IDOR, parameter tampering, and data exposure.
 */

/**
 * Returns true if value is missing, or the literal string "undefined" or "null".
 */
export function isMalformedString(value: unknown): boolean {
  if (value == null) return true;
  const s = String(value).trim();
  return s === '' || s === 'undefined' || s === 'null';
}

/**
 * Returns a trimmed string or null if value is malformed.
 */
export function sanitizeString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (s === '' || s === 'undefined' || s === 'null') return null;
  return s;
}

/**
 * Parses value as a positive integer ID. Returns null for malformed or invalid ids.
 */
export function parsePositiveId(value: unknown): number | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (s === '' || s === 'undefined' || s === 'null') return null;
  const num = parseInt(s, 10);
  if (Number.isNaN(num) || num < 1) return null;
  return num;
}

/**
 * Validates required string param; returns 400 response helper text or null if valid.
 */
export function validateRequiredString(value: unknown, paramName: string): string | null {
  if (isMalformedString(value)) {
    return `${paramName} is required and must be a valid value`;
  }
  return null;
}
