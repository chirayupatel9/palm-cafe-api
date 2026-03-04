import { Request, Response, NextFunction } from 'express';
import { isMalformedString } from '../middleware/validateInput';

export function getOrderCafeId(req: Request): number | null {
  let cafeId: number | null = null;
  if (req.user) {
    if (req.impersonation && req.impersonation.isImpersonating) {
      cafeId = req.impersonation.cafeId ?? null;
    } else if (req.user.cafe_id) {
      cafeId = req.user.cafe_id;
    }
  }
  if (req.user && req.user.role === 'superadmin' && req.query.cafeId != null && req.query.cafeId !== '') {
    const parsed = parseInt(String(req.query.cafeId), 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      cafeId = parsed;
    }
  }
  return cafeId;
}

export function getInventoryCafeId(req: Request): number | null {
  let cafeId: number | null = null;
  if (req.user) {
    if (req.impersonation && req.impersonation.isImpersonating) {
      cafeId = req.impersonation.cafeId ?? null;
    } else if (req.user.cafe_id) {
      cafeId = req.user.cafe_id;
    }
  }
  if (req.user && req.user.role === 'superadmin' && req.query.cafeId != null && req.query.cafeId !== '') {
    const parsed = parseInt(String(req.query.cafeId), 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      cafeId = parsed;
    }
  }
  return cafeId;
}

export function requireOrderCafeScope(req: Request, res: Response, next: NextFunction): void {
  const cafeId = getOrderCafeId(req);
  if (cafeId != null) {
    next();
    return;
  }
  if (req.user && req.user.role === 'superadmin') {
    next();
    return;
  }
  res.status(403).json({
    error: 'You must be assigned to a cafe to access orders.',
    code: 'CAFE_SCOPE_REQUIRED'
  });
}

export function requireInventoryCafeScope(req: Request, res: Response, next: NextFunction): void {
  const cafeId = getInventoryCafeId(req);
  if (cafeId != null) {
    next();
    return;
  }
  if (req.user && req.user.role === 'superadmin') {
    next();
    return;
  }
  res.status(403).json({
    error: 'You must be assigned to a cafe to access inventory.',
    code: 'CAFE_SCOPE_REQUIRED'
  });
}

export function isInvalidCustomerPhone(value: unknown): boolean {
  return isMalformedString(value) || String(value).trim() === '';
}

export interface ParseInventoryIdResult {
  valid: boolean;
  status?: number;
  error?: string;
  value?: number;
}

export function parseInventoryId(idParam: string | undefined): ParseInventoryIdResult {
  if (idParam == null || idParam === '') {
    return { valid: false, status: 400, error: 'Inventory item ID is required' };
  }
  const parsed = parseInt(idParam, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { valid: false, status: 400, error: 'Invalid inventory item ID' };
  }
  return { valid: true, value: parsed };
}

export function validateQuantity(value: unknown): { valid: boolean; error?: string; value?: number } {
  if (value === undefined || value === null || value === '') {
    return { valid: false, error: 'Quantity is required' };
  }
  const num = Number(value);
  if (Number.isNaN(num) || num < 0) {
    return { valid: false, error: 'Quantity must be a non-negative number' };
  }
  return { valid: true, value: num };
}

export const INVENTORY_LIMITS = {
  name: 200,
  category: 100,
  unit: 50,
  supplier: 200
};

export function validateInventoryStrings(data: {
  name?: string;
  category?: string;
  unit?: string;
  supplier?: string | null;
}): { valid: boolean; error?: string } {
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

export const MAX_LIST_LIMIT = 100;

export function parseListLimitOffset(req: Request): { limit: number | null; offset: number } {
  const limitRaw = parseInt(String(req.query.limit), 10);
  const offsetRaw = parseInt(String(req.query.offset), 10);
  const limit = Number.isNaN(limitRaw) || limitRaw < 1 ? null : Math.min(limitRaw, MAX_LIST_LIMIT);
  const offset = Number.isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw;
  return { limit, offset };
}
