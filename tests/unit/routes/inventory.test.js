/**
 * Unit tests for routes/inventory.js.
 * Mocks: Inventory model, auth, helpers (getInventoryCafeId, parseInventoryId, validateQuantity, validateInventoryStrings).
 * Note: routes/inventory.js uses res.status().json() / res.json() only (no responseHelpers).
 */
jest.mock('../../../models/inventory');
jest.mock('../../../middleware/auth', () => ({ auth: (req, res, next) => next() }));
jest.mock('../../../middleware/subscriptionAuth', () => ({
  requireFeature: () => (req, res, next) => next(),
  requireActiveSubscription: (req, res, next) => next()
}));
jest.mock('../../../routes/helpers', () => ({
  getInventoryCafeId: jest.fn().mockReturnValue(1),
  requireInventoryCafeScope: (req, res, next) => next(),
  parseInventoryId: jest.fn().mockReturnValue({ valid: true, value: 1 }),
  validateQuantity: jest.fn().mockReturnValue({ valid: true, value: 10 }),
  validateInventoryStrings: jest.fn().mockReturnValue({ valid: true })
}));
jest.mock('../../../middleware/rateLimiter', () => ({ uploadLimiter: (req, res, next) => next() }));
jest.mock('../../../config/multer', () => ({ upload: { single: () => (req, res, next) => next() } }));
jest.mock('../../../config/logger', () => ({ error: jest.fn() }));

const Inventory = require('../../../models/inventory');
const { getInventoryCafeId, parseInventoryId, validateQuantity, validateInventoryStrings } = require('../../../routes/helpers');

const routes = {};
const mockApp = {
  get: (p, ...fns) => { routes[`GET ${p}`] = fns; },
  post: (p, ...fns) => { routes[`POST ${p}`] = fns; },
  put: (p, ...fns) => { routes[`PUT ${p}`] = fns; },
  patch: (p, ...fns) => { routes[`PATCH ${p}`] = fns; },
  delete: (p, ...fns) => { routes[`DELETE ${p}`] = fns; }
};
require('../../../routes/inventory')(mockApp);

function getHandler(method, pathKey) {
  const stack = routes[`${method} ${pathKey}`];
  return stack ? stack[stack.length - 1] : null;
}

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn(), setHeader: jest.fn() };
}

describe('routes/inventory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getInventoryCafeId.mockReturnValue(1);
    parseInventoryId.mockReturnValue({ valid: true, value: 1 });
    validateQuantity.mockReturnValue({ valid: true, value: 10 });
    validateInventoryStrings.mockReturnValue({ valid: true });
  });

  describe('GET /api/inventory', () => {
    const handler = getHandler('GET', '/api/inventory');
    it('returns 200 with inventory list', async () => {
      Inventory.getAll.mockResolvedValue([{ id: 1, name: 'Coffee', quantity: 10 }]);
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(Inventory.getAll).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Coffee', quantity: 10 }]);
    });
    it('returns 500 on DB error', async () => {
      Inventory.getAll.mockRejectedValue(new Error('DB error'));
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch inventory' });
    });
  });

  describe('POST /api/inventory', () => {
    const handler = getHandler('POST', '/api/inventory');
    const validBody = { name: 'Beans', category: 'Beverages', quantity: 10, unit: 'kg' };
    it('returns 201 with created item on success', async () => {
      Inventory.create.mockResolvedValue({ id: 5, ...validBody });
      const req = { body: validBody };
      const res = mockRes();
      await handler(req, res);
      expect(Inventory.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Beans', category: 'Beverages', quantity: 10, unit: 'kg' }), 1);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: 5, ...validBody });
    });
    it('returns 400 when no cafeId', async () => {
      getInventoryCafeId.mockReturnValue(null);
      const req = { body: validBody };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unable to determine cafe. Please ensure you are logged in and belong to a cafe.' });
    });
    it('returns 400 when name missing', async () => {
      const req = { body: { category: 'C', quantity: 0, unit: 'kg' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Name is required and must be non-empty' });
    });
    it('returns 400 when name is not a string', async () => {
      const req = { body: { name: 123, category: 'C', quantity: 0, unit: 'kg' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Name is required and must be non-empty' });
    });
    it('returns 400 when name empty string', async () => {
      const req = { body: { name: '  ', category: 'C', quantity: 0, unit: 'kg' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 400 when category missing', async () => {
      const req = { body: { name: 'X', quantity: 0, unit: 'kg' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Category is required and must be non-empty' });
    });
    it('returns 400 when unit missing', async () => {
      const req = { body: { name: 'X', category: 'C', quantity: 0 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unit is required and must be non-empty' });
    });
    it('returns 400 when quantity invalid', async () => {
      validateQuantity.mockReturnValue({ valid: false, error: 'Quantity must be a non-negative number' });
      const req = { body: { name: 'X', category: 'C', quantity: -1, unit: 'kg' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Quantity must be a non-negative number' });
    });
    it('returns 400 when cost_per_unit invalid', async () => {
      const req = { body: { ...validBody, cost_per_unit: -5 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cost per unit must be a non-negative number' });
    });
    it('returns 400 when cost_per_unit is NaN', async () => {
      const req = { body: { ...validBody, cost_per_unit: 'abc' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cost per unit must be a non-negative number' });
    });
    it('returns 400 when reorder_level invalid', async () => {
      const req = { body: { ...validBody, reorder_level: -1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Reorder level must be a non-negative number' });
    });
    it('returns 400 when string validation fails', async () => {
      validateInventoryStrings.mockReturnValue({ valid: false, error: 'Name must be at most 200 characters' });
      const req = { body: validBody };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Name must be at most 200 characters' });
    });
    it('returns 500 on create error (duplicate/DB)', async () => {
      Inventory.create.mockRejectedValue(new Error('Duplicate entry'));
      const req = { body: validBody };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create inventory item' });
    });
  });

  describe('PUT /api/inventory/:id', () => {
    const handler = getHandler('PUT', '/api/inventory/:id');
    const validBody = { name: 'Updated', category: 'Beverages', quantity: 20, unit: 'kg' };
    it('returns 200 with updated item on success', async () => {
      Inventory.update.mockResolvedValue({ id: 1, ...validBody });
      const req = { params: { id: '1' }, body: validBody };
      const res = mockRes();
      await handler(req, res);
      expect(parseInventoryId).toHaveBeenCalledWith('1');
      expect(Inventory.update).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Updated', category: 'Beverages', unit: 'kg' }), 1);
      expect(res.json).toHaveBeenCalledWith({ id: 1, ...validBody });
    });
    it('returns 400 when id invalid', async () => {
      parseInventoryId.mockReturnValue({ valid: false, status: 400, error: 'Invalid inventory item ID' });
      const req = { params: { id: 'x' }, body: validBody };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid inventory item ID' });
    });
    it('returns 404 when item not found', async () => {
      Inventory.update.mockRejectedValue(new Error('Inventory item not found'));
      const req = { params: { id: '1' }, body: validBody };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Inventory item not found' });
    });
    it('returns 400 when Invalid inventory item ID from model', async () => {
      Inventory.update.mockRejectedValue(new Error('Invalid inventory item ID'));
      const req = { params: { id: '1' }, body: validBody };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid inventory item ID' });
    });
    it('returns 400 when quantity invalid', async () => {
      validateQuantity.mockReturnValue({ valid: false, error: 'Quantity is required' });
      const req = { params: { id: '1' }, body: validBody };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 500 on DB error', async () => {
      Inventory.update.mockRejectedValue(new Error('DB error'));
      const req = { params: { id: '1' }, body: validBody };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update inventory item' });
    });
  });

  describe('DELETE /api/inventory/:id', () => {
    const handler = getHandler('DELETE', '/api/inventory/:id');
    it('returns 200 with message on success', async () => {
      Inventory.delete.mockResolvedValue(true);
      const req = { params: { id: '1' } };
      const res = mockRes();
      await handler(req, res);
      expect(Inventory.delete).toHaveBeenCalledWith(1, 1);
      expect(res.json).toHaveBeenCalledWith({ message: 'Inventory item deleted successfully' });
    });
    it('returns 400 when id invalid', async () => {
      parseInventoryId.mockReturnValue({ valid: false, status: 400, error: 'Invalid inventory item ID' });
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid inventory item ID' });
    });
    it('returns 404 when item not found', async () => {
      Inventory.delete.mockRejectedValue(new Error('Inventory item not found'));
      const req = { params: { id: '999' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Inventory item not found' });
    });
    it('returns 400 when Invalid inventory item ID from model', async () => {
      Inventory.delete.mockRejectedValue(new Error('Invalid inventory item ID'));
      const req = { params: { id: '1' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 500 on DB error', async () => {
      Inventory.delete.mockRejectedValue(new Error('DB error'));
      const req = { params: { id: '1' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to delete inventory item' });
    });
  });

  describe('GET /api/inventory/:id', () => {
    const handler = getHandler('GET', '/api/inventory/:id');
    it('returns 200 with item when found', async () => {
      Inventory.getById.mockResolvedValue({ id: 1, name: 'Coffee', quantity: 10 });
      const req = { params: { id: '1' } };
      const res = mockRes();
      await handler(req, res);
      expect(parseInventoryId).toHaveBeenCalledWith('1');
      expect(Inventory.getById).toHaveBeenCalledWith(1, 1);
      expect(res.json).toHaveBeenCalledWith({ id: 1, name: 'Coffee', quantity: 10 });
    });
    it('returns 404 when not found', async () => {
      Inventory.getById.mockResolvedValue(null);
      const req = { params: { id: '999' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Inventory item not found' });
    });
    it('returns 400 when id invalid', async () => {
      parseInventoryId.mockReturnValue({ valid: false, status: 400, error: 'Invalid inventory item ID' });
      const req = { params: { id: 'x' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 500 on DB error', async () => {
      Inventory.getById.mockRejectedValue(new Error('DB error'));
      const req = { params: { id: '1' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch inventory item' });
    });
    it('returns 400 when model throws Invalid inventory item ID', async () => {
      Inventory.getById.mockRejectedValue(new Error('Invalid inventory item ID'));
      const req = { params: { id: '1' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid inventory item ID' });
    });
  });

  describe('PATCH /api/inventory/:id/stock', () => {
    const handler = getHandler('PATCH', '/api/inventory/:id/stock');
    it('returns 200 with message on success', async () => {
      Inventory.updateStock.mockResolvedValue(true);
      const req = { params: { id: '1' }, body: { quantity: 15 } };
      const res = mockRes();
      await handler(req, res);
      expect(validateQuantity).toHaveBeenCalledWith(15);
      expect(Inventory.updateStock).toHaveBeenCalledWith(1, 10, 1);
      expect(res.json).toHaveBeenCalledWith({ message: 'Stock updated successfully' });
    });
    it('returns 400 when id invalid', async () => {
      parseInventoryId.mockReturnValue({ valid: false, status: 400, error: 'Invalid inventory item ID' });
      const req = { params: { id: 'x' }, body: { quantity: 5 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 400 when quantity invalid', async () => {
      validateQuantity.mockReturnValue({ valid: false, error: 'Quantity must be a non-negative number' });
      const req = { params: { id: '1' }, body: { quantity: -1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Quantity must be a non-negative number' });
    });
    it('returns 400 when quantity missing (valid: false, no error)', async () => {
      validateQuantity.mockReturnValue({ valid: false });
      const req = { params: { id: '1' }, body: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Valid quantity is required' });
    });
    it('returns 404 when item not found', async () => {
      Inventory.updateStock.mockRejectedValue(new Error('Inventory item not found'));
      const req = { params: { id: '1' }, body: { quantity: 5 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Inventory item not found' });
    });
    it('returns 400 when quantity validation from model', async () => {
      Inventory.updateStock.mockRejectedValue(new Error('Quantity must be a non-negative number'));
      const req = { params: { id: '1' }, body: { quantity: 5 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Quantity must be a non-negative number' });
    });
    it('returns 500 on DB error', async () => {
      Inventory.updateStock.mockRejectedValue(new Error('DB error'));
      const req = { params: { id: '1' }, body: { quantity: 5 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update stock' });
    });
  });

  describe('GET /api/inventory/categories', () => {
    const handler = getHandler('GET', '/api/inventory/categories');
    it('returns 200 with categories', async () => {
      Inventory.getCategories.mockResolvedValue([{ name: 'Beverages', item_count: 5 }]);
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith([{ name: 'Beverages', item_count: 5 }]);
    });
    it('returns 500 on error', async () => {
      Inventory.getCategories.mockRejectedValue(new Error('DB error'));
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch inventory categories' });
    });
  });

  describe('GET /api/inventory/low-stock', () => {
    const handler = getHandler('GET', '/api/inventory/low-stock');
    it('returns 200 with low stock items', async () => {
      Inventory.getLowStockItems.mockResolvedValue([{ id: 1, name: 'Milk', quantity: 2 }]);
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Milk', quantity: 2 }]);
    });
    it('returns 500 on error', async () => {
      Inventory.getLowStockItems.mockRejectedValue(new Error('DB error'));
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch low stock items' });
    });
  });

  describe('GET /api/inventory/out-of-stock', () => {
    const handler = getHandler('GET', '/api/inventory/out-of-stock');
    it('returns 200 with out of stock items', async () => {
      Inventory.getOutOfStockItems.mockResolvedValue([{ id: 1, name: 'Sugar', quantity: 0 }]);
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Sugar', quantity: 0 }]);
    });
    it('returns 500 on error', async () => {
      Inventory.getOutOfStockItems.mockRejectedValue(new Error('DB error'));
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch out of stock items' });
    });
  });

  describe('GET /api/inventory/statistics', () => {
    const handler = getHandler('GET', '/api/inventory/statistics');
    it('returns 200 with statistics', async () => {
      Inventory.getStatistics.mockResolvedValue({ totalItems: 10, lowStockItems: 2, outOfStockItems: 1, totalValue: 100 });
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ totalItems: 10, lowStockItems: 2, outOfStockItems: 1, totalValue: 100 });
    });
    it('returns 500 on error', async () => {
      Inventory.getStatistics.mockRejectedValue(new Error('DB error'));
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch inventory statistics' });
    });
  });

  describe('GET /api/inventory/export', () => {
    const handler = getHandler('GET', '/api/inventory/export');
    it('returns 200 with xlsx buffer and headers', async () => {
      Inventory.exportToExcel.mockResolvedValue({ buffer: Buffer.from('xlsx'), filename: 'inventory_export_2025-01-01.xlsx' });
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('inventory_export'));
      expect(res.send).toHaveBeenCalledWith(Buffer.from('xlsx'));
    });
    it('returns 500 on error', async () => {
      Inventory.exportToExcel.mockRejectedValue(new Error('DB error'));
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to export inventory' });
    });
  });

  describe('GET /api/inventory/template', () => {
    const handler = getHandler('GET', '/api/inventory/template');
    it('returns 200 with template buffer and headers', async () => {
      Inventory.getImportTemplate.mockResolvedValue({ buffer: Buffer.from('template'), filename: 'inventory_import_template.xlsx' });
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('inventory_import_template'));
      expect(res.send).toHaveBeenCalledWith(Buffer.from('template'));
    });
    it('returns 500 on error', async () => {
      Inventory.getImportTemplate.mockRejectedValue(new Error('Template error'));
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to generate template' });
    });
  });

  describe('POST /api/inventory/import', () => {
    const handler = getHandler('POST', '/api/inventory/import');
    it('returns 400 when no file', async () => {
      const req = { file: null };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'No file uploaded' });
    });
    it('returns 400 when no cafeId', async () => {
      getInventoryCafeId.mockReturnValue(null);
      const req = { file: { buffer: Buffer.from('x') } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unable to determine cafe. Import is only available when logged in to a cafe.' });
    });
    it('returns 200 with results on success', async () => {
      Inventory.importFromExcel.mockResolvedValue({ total: 2, successful: 2, failed: 0, errors: [] });
      const req = { file: { buffer: Buffer.from('x') } };
      const res = mockRes();
      await handler(req, res);
      expect(Inventory.importFromExcel).toHaveBeenCalledWith(Buffer.from('x'), 1);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Import completed',
        results: { total: 2, successful: 2, failed: 0, errors: [] }
      });
    });
    it('returns 500 on import error', async () => {
      Inventory.importFromExcel.mockRejectedValue(new Error('Parse error'));
      const req = { file: { buffer: Buffer.from('x') } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to import inventory' });
    });
  });
});
