/**
 * Input validation helpers to reject malformed parameters (e.g. undefined, "undefined")
 * and reduce risk of IDOR, parameter tampering, and data exposure.
 */

/**
 * Returns true if value is missing, or the literal string "undefined" or "null".
 * @param {*} value
 * @returns {boolean}
 */
function isMalformedString(value) {
  if (value == null) return true;
  const s = String(value).trim();
  return s === '' || s === 'undefined' || s === 'null';
}

/**
 * Returns a trimmed string or null if value is malformed.
 * @param {*} value
 * @returns {string|null}
 */
function sanitizeString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (s === '' || s === 'undefined' || s === 'null') return null;
  return s;
}

/**
 * Parses value as a positive integer ID. Returns null for malformed or invalid ids.
 * @param {*} value
 * @returns {number|null}
 */
function parsePositiveId(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (s === '' || s === 'undefined' || s === 'null') return null;
  const num = parseInt(s, 10);
  if (Number.isNaN(num) || num < 1) return null;
  return num;
}

/**
 * Validates required string param; returns 400 response helper text or null if valid.
 * @param {*} value
 * @param {string} paramName
 * @returns {string|null} Error message or null
 */
function validateRequiredString(value, paramName) {
  if (isMalformedString(value)) {
    return `${paramName} is required and must be a valid value`;
  }
  return null;
}

module.exports = {
  isMalformedString,
  sanitizeString,
  parsePositiveId,
  validateRequiredString
};
