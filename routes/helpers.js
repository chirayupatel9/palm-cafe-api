const { isMalformedString } = require('../middleware/validateInput');

/**
 * Resolve the cafe ID to use for order operations from the request context.
 * 
 * Checks impersonation, the authenticated user's cafe assignment, and allows a
 * superadmin to override via req.query.cafeId when it is a positive integer.
 * @param {object} req - Express request object. Expected properties:
 *   - user: authenticated user object (may contain `cafe_id` and `role`)
 *   - impersonation: optional object with `isImpersonating` and `cafeId`
 *   - query: request query object (may contain `cafeId`)
 * @returns {number|null} The resolved cafe ID, or `null` if no cafe scope is available.
 */
function getOrderCafeId(req) {
  let cafeId = null;
  if (req.user) {
    if (req.impersonation && req.impersonation.isImpersonating) {
      cafeId = req.impersonation.cafeId;
    } else if (req.user.cafe_id) {
      cafeId = req.user.cafe_id;
    }
  }
  if (req.user && req.user.role === 'superadmin' && req.query.cafeId != null && req.query.cafeId !== '') {
    const parsed = parseInt(req.query.cafeId, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      cafeId = parsed;
    }
  }
  return cafeId;
}

/**
 * Determine the cafe scope to use for inventory operations based on the request.
 *
 * @param {object} req - Express request object; expected to contain optional `user`, optional `impersonation` (with `isImpersonating` and `cafeId`), and optional `query.cafeId`.
 * @returns {number|null} The cafe ID to use for inventory operations, or `null` if no cafe scope is available.
 */
function getInventoryCafeId(req) {
  let cafeId = null;
  if (req.user) {
    if (req.impersonation && req.impersonation.isImpersonating) {
      cafeId = req.impersonation.cafeId;
    } else if (req.user.cafe_id) {
      cafeId = req.user.cafe_id;
    }
  }
  if (req.user && req.user.role === 'superadmin' && req.query.cafeId != null && req.query.cafeId !== '') {
    const parsed = parseInt(req.query.cafeId, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      cafeId = parsed;
    }
  }
  return cafeId;
}

/**
 * Ensures the request is scoped to a cafe for order access or rejects it.
 *
 * Calls `next()` if the resolved cafe scope is present or the authenticated user is a `superadmin`.
 * Otherwise responds with HTTP 403 and JSON: `{ error: 'You must be assigned to a cafe to access orders.', code: 'CAFE_SCOPE_REQUIRED' }`.
 */
function requireOrderCafeScope(req, res, next) {
  const cafeId = getOrderCafeId(req);
  if (cafeId != null) return next();
  if (req.user && req.user.role === 'superadmin') return next();
  return res.status(403).json({
    error: 'You must be assigned to a cafe to access orders.',
    code: 'CAFE_SCOPE_REQUIRED'
  });
}

/**
 * Ensure the request is scoped to a cafe for inventory access or respond with 403.
 *
 * If the request has a cafe scope or the authenticated user is a `superadmin`, the middleware calls `next()`.
 * Otherwise responds with HTTP 403 and a JSON body:
 * `{ error: 'You must be assigned to a cafe to access inventory.', code: 'CAFE_SCOPE_REQUIRED' }`.
 */
function requireInventoryCafeScope(req, res, next) {
  const cafeId = getInventoryCafeId(req);
  if (cafeId != null) return next();
  if (req.user && req.user.role === 'superadmin') return next();
  return res.status(403).json({
    error: 'You must be assigned to a cafe to access inventory.',
    code: 'CAFE_SCOPE_REQUIRED'
  });
}

/**
 * Checks whether a customer phone value is invalid.
 * @param {*} value - The phone value to validate.
 * @returns {boolean} `true` if the value is malformed or is an empty/whitespace string, `false` otherwise.
 */
function isInvalidCustomerPhone(value) {
  return isMalformedString(value) || String(value).trim() === '';
}

/**
 * Validate and parse an inventory item ID from an input value.
 * @param {*} idParam - The raw ID value (commonly a string or number) to validate and parse.
 * @returns {{valid: true, value: number} | {valid: false, status: number, error: string}} If valid, `{ valid: true, value }` with the parsed integer ID; otherwise `{ valid: false, status: 400, error }` describing the validation failure.
 */
function parseInventoryId(idParam) {
  if (idParam == null || idParam === '') {
    return { valid: false, status: 400, error: 'Inventory item ID is required' };
  }
  const parsed = parseInt(idParam, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { valid: false, status: 400, error: 'Invalid inventory item ID' };
  }
  return { valid: true, value: parsed };
}

/**
 * Validate a quantity input and convert it to a numeric value.
 * @param {(string|number|null|undefined)} value - The input to validate (may be a numeric string or number).
 * @returns {{ valid: true, value: number }|{ valid: false, error: string }} `valid: true` with numeric `value` when input is a number greater than or equal to 0; otherwise `valid: false` with an `error` message.
 */
function validateQuantity(value) {
  if (value === undefined || value === null || value === '') return { valid: false, error: 'Quantity is required' };
  const num = Number(value);
  if (Number.isNaN(num) || num < 0) return { valid: false, error: 'Quantity must be a non-negative number' };
  return { valid: true, value: num };
}

const INVENTORY_LIMITS = {
  name: 200,
  category: 100,
  unit: 50,
  supplier: 200
};

/**
 * Validate inventory string fields against the configured length limits.
 * @param {{name?: string, category?: string, unit?: string, supplier?: string}} data - Object containing optional string fields to validate.
 * @returns {{valid: true} | {valid: false, error: string}} An object with `valid: true` when all present fields are within limits; otherwise `valid: false` and an `error` message indicating which field exceeds its maximum length.
 */
function validateInventoryStrings(data) {
  if (data.name && data.name.length > INVENTORY_LIMITS.name) {
    return { valid: false, error: `Name must be at most ${INVENTORY_LIMITS.name} characters` };
  }
  if (data.category && data.category.length > INVENTORY_LIMITS.category) {
    return { valid: false, error: `Category must be at most ${INVENTORY_LIMITS.category} characters` };
  }
  if (data.unit && data.unit.length > INVENTORY_LIMITS.unit) {
    return { valid: false, error: `Unit must be at most ${INVENTORY_LIMITS.unit} characters` };
  }
  if (data.supplier && data.supplier.length > INVENTORY_LIMITS.supplier) {
    return { valid: false, error: `Supplier must be at most ${INVENTORY_LIMITS.supplier} characters` };
  }
  return { valid: true };
}

const MAX_LIST_LIMIT = 100;

/**
 * Parse pagination `limit` and `offset` from an Express request query, enforcing bounds.
 * @param {object} req - Express request containing optional `query.limit` and `query.offset` strings.
 * @returns {{limit: number|null, offset: number}} An object where `limit` is either a positive integer up to MAX_LIST_LIMIT or `null` (no limit), and `offset` is a non-negative integer (default 0).
 */
function parseListLimitOffset(req) {
  const limitRaw = parseInt(req.query.limit, 10);
  const offsetRaw = parseInt(req.query.offset, 10);
  const limit = Number.isNaN(limitRaw) || limitRaw < 1 ? null : Math.min(limitRaw, MAX_LIST_LIMIT);
  const offset = Number.isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw;
  return { limit, offset };
}

module.exports = {
  MAX_LIST_LIMIT,
  parseListLimitOffset,
  getOrderCafeId,
  getInventoryCafeId,
  requireOrderCafeScope,
  requireInventoryCafeScope,
  isInvalidCustomerPhone,
  parseInventoryId,
  validateQuantity,
  INVENTORY_LIMITS,
  validateInventoryStrings
};
