const { isMalformedString } = require('../middleware/validateInput');

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

function requireOrderCafeScope(req, res, next) {
  const cafeId = getOrderCafeId(req);
  if (cafeId != null) return next();
  if (req.user && req.user.role === 'superadmin') return next();
  return res.status(403).json({
    error: 'You must be assigned to a cafe to access orders.',
    code: 'CAFE_SCOPE_REQUIRED'
  });
}

function requireInventoryCafeScope(req, res, next) {
  const cafeId = getInventoryCafeId(req);
  if (cafeId != null) return next();
  if (req.user && req.user.role === 'superadmin') return next();
  return res.status(403).json({
    error: 'You must be assigned to a cafe to access inventory.',
    code: 'CAFE_SCOPE_REQUIRED'
  });
}

function isInvalidCustomerPhone(value) {
  return isMalformedString(value) || String(value).trim() === '';
}

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
