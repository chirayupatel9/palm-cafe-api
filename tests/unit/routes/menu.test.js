/**
 * Unit tests for routes/menu.js (menu items, categories, image upload/remove).
 * Mocks: Category, MenuItem, User, Cafe, auth, imageUpload, fs.
 */
const fs = require('fs');

jest.mock('../../../models/category');
jest.mock('../../../models/menuItem');
jest.mock('../../../models/user');
jest.mock('../../../models/cafe');
jest.mock('../../../models/taxSettings');
jest.mock('../../../models/currencySettings');
jest.mock('../../../models/cafeSettings');
jest.mock('../../../models/promoBanner');
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn().mockResolvedValue({ release: jest.fn() })
  }
}));
jest.mock('../../../config/multer', () => ({
  upload: { single: () => (req, res, next) => next() },
  zipUpload: { array: () => (req, res, next) => next() },
  imageUpload: { single: () => (req, res, next) => next() },
  multer: {}
}));
jest.mock('../../../middleware/auth', () => ({ auth: (req, res, next) => next(), adminAuth: (req, res, next) => next(), JWT_SECRET: 'test' }));
jest.mock('../../../middleware/cafeAuth', () => ({ requireCafeMembership: (req, res, next) => next() }));
jest.mock('../../../routes/helpers', () => ({
  getOrderCafeId: jest.fn().mockReturnValue(1),
  requireOrderCafeScope: (req, res, next) => next()
}));
jest.mock('../../../middleware/subscriptionAuth', () => ({
  requireFeature: () => (req, res, next) => next(),
  requireActiveSubscription: (req, res, next) => next()
}));
jest.mock('../../../middleware/rateLimiter', () => ({ uploadLimiter: (req, res, next) => next() }));
jest.mock('../../../config/logger', () => ({ error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() }));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  statSync: jest.fn().mockReturnValue({ size: 100 })
}));

jest.mock('xlsx', () => ({
  utils: {
    book_new: jest.fn().mockReturnValue({}),
    json_to_sheet: jest.fn().mockReturnValue({}),
    book_append_sheet: jest.fn(),
    sheet_to_json: jest.fn().mockReturnValue([])
  },
  write: jest.fn().mockReturnValue(Buffer.from('xlsx-buffer')),
  read: jest.fn().mockReturnValue({ SheetNames: [], Sheets: {} })
}));

const { getOrderCafeId } = require('../../../routes/helpers');
const Category = require('../../../models/category');
const MenuItem = require('../../../models/menuItem');
const User = require('../../../models/user');
const Cafe = require('../../../models/cafe');
const TaxSettings = require('../../../models/taxSettings');
const CurrencySettings = require('../../../models/currencySettings');
const CafeSettings = require('../../../models/cafeSettings');
const PromoBanner = require('../../../models/promoBanner');
const { pool } = require('../../../config/database');
const XLSX = require('xlsx');

const routes = {};
const mockApp = {
  get: (p, ...fns) => { routes[`GET ${p}`] = fns; },
  post: (p, ...fns) => { routes[`POST ${p}`] = fns; },
  put: (p, ...fns) => { routes[`PUT ${p}`] = fns; },
  patch: (p, ...fns) => { routes[`PATCH ${p}`] = fns; },
  delete: (p, ...fns) => { routes[`DELETE ${p}`] = fns; }
};
require('../../../routes/menu')(mockApp);

function getHandler(method, pathKey) {
  const stack = routes[`${method} ${pathKey}`];
  return stack ? stack[stack.length - 1] : null;
}

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    send: jest.fn(),
    setHeader: jest.fn()
  };
}

describe('routes/menu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOrderCafeId.mockReturnValue(1);
    fs.existsSync.mockReturnValue(false);
  });

  describe('GET /api/categories', () => {
    const handler = getHandler('GET', '/api/categories');
    it('returns 200 with categories', async () => {
      Category.getAll.mockResolvedValue([{ id: 1, name: 'Drinks' }]);
      const req = { user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Drinks' }]);
    });
    it('uses impersonation cafeId when impersonating', async () => {
      Category.getAll.mockResolvedValue([{ id: 2, name: 'Food' }]);
      const req = { user: { cafe_id: 1 }, impersonation: { isImpersonating: true, cafeId: 2 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(Category.getAll).toHaveBeenCalledWith(2);
      expect(res.json).toHaveBeenCalledWith([{ id: 2, name: 'Food' }]);
    });
    it('uses query cafeId when superadmin', async () => {
      Category.getAll.mockResolvedValue([{ id: 3, name: 'Snacks' }]);
      const req = { user: { cafe_id: 1, role: 'superadmin' }, query: { cafeId: '3' } };
      const res = mockRes();
      await handler(req, res);
      expect(Category.getAll).toHaveBeenCalledWith(3);
      expect(res.json).toHaveBeenCalledWith([{ id: 3, name: 'Snacks' }]);
    });
    it('returns 500 on error', async () => {
      Category.getAll.mockRejectedValue(new Error('db'));
      const req = { user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch categories' });
    });
  });

  describe('GET /api/categories/with-counts', () => {
    const handler = getHandler('GET', '/api/categories/with-counts');
    it('returns 200 with categories and counts', async () => {
      Category.getWithItemCounts.mockResolvedValue([{ id: 1, name: 'Drinks', item_count: 5 }]);
      const req = { user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Drinks', item_count: 5 }]);
    });
  });

  describe('POST /api/categories', () => {
    const handler = getHandler('POST', '/api/categories');
    it('returns 400 when name missing', async () => {
      const req = { body: {}, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Category name is required' });
    });
    it('returns 400 when no cafeId', async () => {
      const req = { body: { name: 'X' }, user: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 201 with created category', async () => {
      Category.create.mockResolvedValue({ id: 5, name: 'Snacks' });
      const req = { body: { name: 'Snacks' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: 5, name: 'Snacks' });
    });
  });

  describe('PUT /api/categories/:id', () => {
    const handler = getHandler('PUT', '/api/categories/:id');
    it('returns 400 when name missing', async () => {
      const req = { params: { id: '1' }, body: {}, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 200 with updated category', async () => {
      Category.update.mockResolvedValue({ id: 1, name: 'Updated' });
      const req = { params: { id: '1' }, body: { name: 'Updated', description: '', sort_order: 0 }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ id: 1, name: 'Updated' });
    });
  });

  describe('DELETE /api/categories/:id', () => {
    const handler = getHandler('DELETE', '/api/categories/:id');
    it('returns 204 on success', async () => {
      Category.delete.mockResolvedValue({ success: true });
      const req = { params: { id: '1' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });
    it('returns 404 when category not found', async () => {
      Category.delete.mockResolvedValue(null);
      const req = { params: { id: '99' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Category not found' });
    });
  });

  describe('POST /api/categories/generate', () => {
    const handler = getHandler('POST', '/api/categories/generate');
    it('returns 400 when no cafeId', async () => {
      const req = { user: {}, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 200 with generated categories', async () => {
      Category.generateFromMenuItems.mockResolvedValue([{ id: 1, name: 'Drinks' }]);
      const req = { user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Categories generated successfully from menu items',
        categories: [{ id: 1, name: 'Drinks' }]
      });
    });
  });

  describe('GET /api/categories/auto-generated', () => {
    const handler = getHandler('GET', '/api/categories/auto-generated');
    it('returns 200 with auto-generated categories', async () => {
      Category.getAutoGenerated.mockResolvedValue([{ id: 1, name: 'Auto' }]);
      const req = { user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Auto' }]);
    });
  });

  describe('GET /api/tax-settings', () => {
    const handler = getHandler('GET', '/api/tax-settings');
    it('returns 200 with tax settings', async () => {
      getOrderCafeId.mockReturnValue(1);
      TaxSettings.getCurrent.mockResolvedValue({ tax_rate: 0.1, tax_name: 'VAT' });
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ tax_rate: 0.1, tax_name: 'VAT' });
    });
    it('returns 500 on error', async () => {
      TaxSettings.getCurrent.mockRejectedValue(new Error('db'));
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch tax settings' });
    });
  });

  describe('GET /api/tax-settings/menu', () => {
    const handler = getHandler('GET', '/api/tax-settings/menu');
    it('returns 200 with show_tax_in_menu and tax_rate', async () => {
      Cafe.getBySlug.mockResolvedValue({ id: 1 });
      TaxSettings.getCurrent.mockResolvedValue({ show_tax_in_menu: true, tax_rate: 0.08 });
      const req = { query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ show_tax_in_menu: true, tax_rate: 0.08 });
    });
  });

  describe('PUT /api/tax-settings', () => {
    const handler = getHandler('PUT', '/api/tax-settings');
    it('returns 400 when tax_rate or tax_name missing', async () => {
      const req = { body: {}, user: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tax rate and tax name are required' });
    });
    it('returns 200 with updated settings', async () => {
      TaxSettings.update.mockResolvedValue({ tax_rate: 0.09, tax_name: 'GST' });
      const req = { body: { tax_rate: 0.09, tax_name: 'GST' }, user: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ tax_rate: 0.09, tax_name: 'GST' });
    });
  });

  describe('GET /api/tax-settings/history', () => {
    const handler = getHandler('GET', '/api/tax-settings/history');
    it('returns 200 with history', async () => {
      TaxSettings.getHistory.mockResolvedValue([{ id: 1, tax_rate: 0.1 }]);
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith([{ id: 1, tax_rate: 0.1 }]);
    });
  });

  describe('GET /api/currency-settings', () => {
    const handler = getHandler('GET', '/api/currency-settings');
    it('returns 200 with currency settings when cafeSlug provided', async () => {
      Cafe.getBySlug.mockResolvedValue({ id: 1 });
      CurrencySettings.getCurrent.mockResolvedValue({ currency_code: 'USD', currency_symbol: '$' });
      const req = { query: { cafeSlug: 'my-cafe' }, header: () => null };
      await handler(req, mockRes());
      expect(CurrencySettings.getCurrent).toHaveBeenCalledWith(1);
    });
  });

  describe('GET /api/currency-settings/available', () => {
    const handler = getHandler('GET', '/api/currency-settings/available');
    it('returns 200 with available currencies', async () => {
      CurrencySettings.getAvailableCurrencies.mockResolvedValue([{ code: 'USD', symbol: '$' }]);
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith([{ code: 'USD', symbol: '$' }]);
    });
  });

  describe('PUT /api/currency-settings', () => {
    const handler = getHandler('PUT', '/api/currency-settings');
    it('returns 400 when currency fields missing', async () => {
      const req = { body: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Currency code, symbol, and name are required' });
    });
    it('returns 200 with updated settings', async () => {
      CurrencySettings.update.mockResolvedValue({ currency_code: 'USD', currency_symbol: '$' });
      const req = { body: { currency_code: 'USD', currency_symbol: '$', currency_name: 'US Dollar' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ currency_code: 'USD', currency_symbol: '$' });
    });
  });

  describe('GET /api/currency-settings/history', () => {
    const handler = getHandler('GET', '/api/currency-settings/history');
    it('returns 200 with history', async () => {
      CurrencySettings.getHistory.mockResolvedValue([{ id: 1, currency_code: 'USD' }]);
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith([{ id: 1, currency_code: 'USD' }]);
    });
  });

  describe('POST /api/calculate-tax', () => {
    const handler = getHandler('POST', '/api/calculate-tax');
    it('returns 400 when subtotal missing', async () => {
      const req = { body: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Subtotal is required' });
    });
    it('returns 200 with tax calculation', async () => {
      TaxSettings.calculateTax.mockResolvedValue({ subtotal: 100, tax: 10, total: 110 });
      const req = { body: { subtotal: 100 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ subtotal: 100, tax: 10, total: 110 });
    });
  });

  describe('GET /api/menu/branding', () => {
    const handler = getHandler('GET', '/api/menu/branding');
    it('returns 404 when cafe not found', async () => {
      Cafe.getBySlug.mockResolvedValue(null);
      const req = { query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cafe not found' });
    });
    it('returns 200 with branding when pool has cafe_id and branding columns', async () => {
      Cafe.getBySlug.mockResolvedValue({ id: 1, name: 'Palm', address: null, phone: null, email: null });
      pool.execute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'hero_image_url' }, { COLUMN_NAME: 'promo_banner_image_url' }, { COLUMN_NAME: 'logo_url' }]])
        .mockResolvedValueOnce([[{ hero_image_url: '/hero.jpg', promo_banner_image_url: null, logo_url: null }]]);
      PromoBanner.getActiveByCafeId.mockResolvedValue([]);
      const req = { query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        hero_image_url: '/hero.jpg',
        promo_banner_image_url: null,
        logo_url: null,
        cafe_name: 'Palm'
      }));
    });
  });

  describe('GET /api/menu/featured', () => {
    const handler = getHandler('GET', '/api/menu/featured');
    it('returns 404 when cafe not found', async () => {
      Cafe.getBySlug.mockResolvedValue(null);
      const req = { query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cafe not found' });
    });
    it('returns 200 with items', async () => {
      Cafe.getBySlug.mockResolvedValue({ id: 1 });
      MenuItem.getFeatured.mockResolvedValue([{ id: 1, name: 'Latte' }]);
      const req = { query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ items: [{ id: 1, name: 'Latte' }] });
    });
  });

  describe('GET /api/menu/public-info', () => {
    const handler = getHandler('GET', '/api/menu/public-info');
    it('returns 404 when cafe not found', async () => {
      Cafe.getBySlug.mockResolvedValue(null);
      const req = { query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cafe not found' });
    });
    it('returns 200 with cafe public info', async () => {
      Cafe.getBySlug.mockResolvedValue({ id: 1, name: 'Palm Cafe', address: '123 Main St', phone: '', email: '', website: '' });
      const req = { query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ name: 'Palm Cafe', address: '123 Main St' }));
    });
  });

  describe('POST /api/menu/import', () => {
    const handler = getHandler('POST', '/api/menu/import');
    it('returns 400 when no file uploaded', async () => {
      const req = { file: null, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'No file uploaded' });
    });
    it('returns 400 when no cafeId', async () => {
      Cafe.getBySlug.mockResolvedValue(null);
      const req = { file: { buffer: Buffer.from('x') }, user: {}, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Unable to determine cafe') }));
    });
    it('returns 400 when Menu Items sheet not found', async () => {
      XLSX.read.mockReturnValue({ SheetNames: ['Other'], Sheets: { 'Other': {} } });
      const req = { file: { buffer: Buffer.from('x') }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Menu Items sheet not found in Excel file' });
    });
    it('returns 400 when no data in sheet', async () => {
      XLSX.read.mockReturnValue({ SheetNames: ['Menu Items'], Sheets: { 'Menu Items': {} } });
      XLSX.utils.sheet_to_json.mockReturnValue([]);
      const req = { file: { buffer: Buffer.from('x') }, user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'No data found in Menu Items sheet' });
    });
  });

  describe('GET /api/menu/export', () => {
    const handler = getHandler('GET', '/api/menu/export');
    it('returns 400 when no cafeId', async () => {
      Cafe.getBySlug.mockResolvedValue(null);
      const req = { user: {}, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Unable to determine cafe') }));
    });
    it('returns 404 when no menu items', async () => {
      MenuItem.getAll.mockResolvedValue([]);
      const req = { user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('No menu items found') }));
    });
    it('returns 200 with xlsx buffer and headers', async () => {
      MenuItem.getAll.mockResolvedValue([{ id: 1, name: 'Coffee', category_id: 1, category_name: 'Drinks', price: 5, description: '', sort_order: 0, image_url: null }]);
      Category.getAll.mockResolvedValue([{ id: 1, name: 'Drinks', description: '', sort_order: 0 }]);
      const req = { user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename=palm-cafe-menu.xlsx');
      expect(res.send).toHaveBeenCalledWith(Buffer.from('xlsx-buffer'));
    });
  });

  describe('PUT /api/cafe-settings', () => {
    const handler = getHandler('PUT', '/api/cafe-settings');
    it('returns 400 when cafe_name missing', async () => {
      const req = { body: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Cafe name is required' }));
    });
    it('returns 200 with updated settings when user has cafe_id', async () => {
      CafeSettings.update.mockResolvedValue({ cafe_id: 1, cafe_name: 'Palm Cafe' });
      const req = { body: { cafe_name: 'Palm Cafe' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(CafeSettings.update).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ cafe_id: 1, cafe_name: 'Palm Cafe' });
    });
  });

  describe('GET /api/cafe-settings', () => {
    const handler = getHandler('GET', '/api/cafe-settings');
    it('returns 200 with cafe settings when cafeSlug in query (no token)', async () => {
      Cafe.getBySlug.mockResolvedValue({ id: 1, name: 'Palm', slug: 'default' });
      CafeSettings.getCurrent.mockResolvedValue({ cafe_id: 1, cafe_name: 'Palm', hero_image_url: null, promo_banner_image_url: null, logo_url: null });
      const req = { query: { cafeSlug: 'default' }, header: () => undefined };
      const res = mockRes();
      await handler(req, res);
      expect(CafeSettings.getCurrent).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ cafe_id: 1 }));
    });
  });

  describe('GET /api/menu', () => {
    const handler = getHandler('GET', '/api/menu');
    it('returns 200 with menu items when cafe resolved from slug', async () => {
      Cafe.getBySlug.mockResolvedValue({ id: 1 });
      MenuItem.getAll.mockResolvedValue([{ id: 1, name: 'Coffee', price: 5 }]);
      const req = { query: {}, header: () => undefined };
      const res = mockRes();
      await handler(req, res);
      expect(Cafe.getBySlug).toHaveBeenCalledWith('default');
      expect(MenuItem.getAll).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Coffee', price: 5 }]);
    });
    it('returns 400 when no cafe context', async () => {
      Cafe.getBySlug.mockResolvedValue(null);
      Cafe.getFirstActive.mockResolvedValue(null);
      const req = { query: {}, header: () => undefined };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CAFE_REQUIRED' }));
    });
  });

  describe('GET /api/admin/menu', () => {
    const handler = getHandler('GET', '/api/admin/menu');
    it('returns 200 with menu items for user cafe', async () => {
      User.findByIdWithCafe.mockResolvedValue({ id: 1, cafe_id: 2 });
      MenuItem.getAll.mockResolvedValue([{ id: 1, name: 'Tea', price: 3 }]);
      const req = { user: { id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(MenuItem.getAll).toHaveBeenCalledWith(2);
      expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Tea', price: 3 }]);
    });
    it('returns 500 on error', async () => {
      User.findByIdWithCafe.mockRejectedValue(new Error('db'));
      const req = { user: { id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch menu items' });
    });
  });

  describe('GET /api/menu/grouped', () => {
    const handler = getHandler('GET', '/api/menu/grouped');
    it('returns 200 with grouped menu items', async () => {
      User.findByIdWithCafe.mockResolvedValue({ id: 1, cafe_id: 1 });
      MenuItem.getGroupedByCategory.mockResolvedValue([{ category: 'Drinks', items: [{ name: 'Coffee' }] }]);
      const req = { user: { id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(MenuItem.getGroupedByCategory).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith([{ category: 'Drinks', items: [{ name: 'Coffee' }] }]);
    });
  });

  describe('POST /api/menu', () => {
    const handler = getHandler('POST', '/api/menu');
    it('returns 400 when category_id missing', async () => {
      const req = { body: { name: 'Coffee', price: 5 }, user: { id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Category, name and price are required' });
    });
    it('returns 400 when name missing', async () => {
      const req = { body: { category_id: 1, price: 5 }, user: { id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 400 when price missing', async () => {
      const req = { body: { category_id: 1, name: 'Tea' }, user: { id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 201 with created item on success', async () => {
      User.findByIdWithCafe.mockResolvedValue({ id: 1, cafe_id: 1 });
      MenuItem.create.mockResolvedValue({ id: 10, name: 'Latte', category_id: 1, price: 8 });
      const req = { body: { category_id: 1, name: 'Latte', price: 8 }, user: { id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(MenuItem.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Latte', category_id: 1, cafe_id: 1 }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: 10, name: 'Latte', category_id: 1, price: 8 });
    });
    it('uses Cafe.getBySlug when user has no cafe_id', async () => {
      User.findByIdWithCafe.mockResolvedValue({ id: 1, cafe_id: null });
      Cafe.getBySlug.mockResolvedValue({ id: 2 });
      MenuItem.create.mockResolvedValue({ id: 11, name: 'Mocha', cafe_id: 2 });
      const req = { body: { category_id: 1, name: 'Mocha', price: 9 }, user: { id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(Cafe.getBySlug).toHaveBeenCalledWith('default');
      expect(MenuItem.create).toHaveBeenCalledWith(expect.objectContaining({ cafe_id: 2 }));
    });
    it('returns 500 on create error (internal)', async () => {
      User.findByIdWithCafe.mockResolvedValue({ cafe_id: 1 });
      MenuItem.create.mockRejectedValue(new Error('DB duplicate'));
      const req = { body: { category_id: 1, name: 'X', price: 1 }, user: { id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create menu item' });
    });
  });

  describe('PUT /api/menu/:id', () => {
    const handler = getHandler('PUT', '/api/menu/:id');
    it('returns 400 when category_id missing', async () => {
      const req = { params: { id: '1' }, body: { name: 'Coffee', price: 5 }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Category, name and price are required' });
    });
    it('returns 200 with updated item on success', async () => {
      MenuItem.update.mockResolvedValue({ id: 1, name: 'Updated Coffee', category_id: 1, price: 6 });
      const req = { params: { id: '1' }, body: { category_id: 1, name: 'Updated Coffee', price: 6 }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(MenuItem.update).toHaveBeenCalledWith('1', expect.objectContaining({ name: 'Updated Coffee', category_id: 1 }), 1);
      expect(res.json).toHaveBeenCalledWith({ id: 1, name: 'Updated Coffee', category_id: 1, price: 6 });
    });
    it('returns 500 when update throws (not found)', async () => {
      MenuItem.update.mockRejectedValue(new Error('Menu item not found'));
      const req = { params: { id: '999' }, body: { category_id: 1, name: 'X', price: 1 }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update menu item' });
    });
    it('returns 500 on internal error', async () => {
      MenuItem.update.mockRejectedValue(new Error('DB error'));
      const req = { params: { id: '1' }, body: { category_id: 1, name: 'X', price: 1 }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('DELETE /api/menu/:id', () => {
    const handler = getHandler('DELETE', '/api/menu/:id');
    it('returns 404 when item not found', async () => {
      MenuItem.delete.mockResolvedValue(null);
      const req = { params: { id: '999' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Menu item not found' });
    });
    it('returns 204 on success', async () => {
      MenuItem.delete.mockResolvedValue({ success: true });
      const req = { params: { id: '1' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(MenuItem.delete).toHaveBeenCalledWith('1', 1);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });
    it('returns 500 when delete throws', async () => {
      MenuItem.delete.mockRejectedValue(new Error('DB error'));
      const req = { params: { id: '1' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to delete menu item' });
    });
  });

  describe('POST /api/menu/upload-image', () => {
    const handler = getHandler('POST', '/api/menu/upload-image');
    it('returns 400 when no file uploaded', async () => {
      const req = { file: null };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'No image file uploaded' });
    });
    it('returns 400 when file type not image', async () => {
      const req = { file: { mimetype: 'application/pdf', size: 1000, originalname: 'x.pdf', buffer: Buffer.from('x') } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Only image files are allowed' });
    });
    it('returns 400 when file too large', async () => {
      const req = { file: { mimetype: 'image/jpeg', size: 6 * 1024 * 1024, originalname: 'x.jpg', buffer: Buffer.from('x') } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Image size must be less than 5MB' });
    });
    it('returns 200 with image_url on success', async () => {
      fs.existsSync.mockReturnValue(false);
      const req = { file: { mimetype: 'image/jpeg', size: 1000, originalname: 'pic.jpg', buffer: Buffer.from('x') } };
      const res = mockRes();
      await handler(req, res);
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, image_url: expect.any(String), message: 'Image uploaded successfully' }));
    });
    it('returns 500 on write error', async () => {
      fs.writeFileSync.mockImplementation(() => { throw new Error('disk full'); });
      const req = { file: { mimetype: 'image/jpeg', size: 1000, originalname: 'x.jpg', buffer: Buffer.from('x') } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to upload image' });
    });
  });

  describe('POST /api/menu/:id/image', () => {
    const handler = getHandler('POST', '/api/menu/:id/image');
    it('returns 400 when no file uploaded', async () => {
      const req = { params: { id: '1' }, file: null, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'No image file uploaded' });
    });
    it('returns 404 when menu item not found', async () => {
      MenuItem.getById.mockResolvedValue(null);
      const req = { params: { id: '999' }, file: { mimetype: 'image/jpeg', size: 1000, originalname: 'x.jpg', buffer: Buffer.from('x') }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Menu item not found' });
    });
    it('returns 403 when cafe access denied (not superadmin)', async () => {
      MenuItem.getById.mockResolvedValue({ id: 1, cafe_id: 2, category_id: 1, name: 'X', price: 5, sort_order: 0, is_available: true });
      const req = { params: { id: '1' }, file: { mimetype: 'image/jpeg', size: 1000, originalname: 'x.jpg', buffer: Buffer.from('x') }, user: { cafe_id: 1, role: 'admin' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied. You do not have permission to modify this menu item.' });
    });
    it('returns 200 with image_url and menu_item on success', async () => {
      MenuItem.getById.mockResolvedValue({ id: 1, cafe_id: 1, category_id: 1, name: 'Coffee', description: '', price: 5, sort_order: 0, is_available: true, image_url: null, featured_priority: null });
      MenuItem.update.mockResolvedValue({ id: 1, image_url: '/images/menu-item-1-123.jpg' });
      fs.writeFileSync.mockImplementation(() => {});
      const req = { params: { id: '1' }, file: { mimetype: 'image/jpeg', size: 1000, originalname: 'x.jpg', buffer: Buffer.from('x') }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, image_url: expect.any(String), message: 'Image uploaded successfully' }));
      expect(MenuItem.update).toHaveBeenCalledWith('1', expect.objectContaining({ image_url: expect.stringContaining('/images/') }));
    });
    it('allows superadmin to modify other cafe item', async () => {
      MenuItem.getById.mockResolvedValue({ id: 1, cafe_id: 2, category_id: 1, name: 'X', price: 5, sort_order: 0, is_available: true, image_url: null, featured_priority: null });
      MenuItem.update.mockResolvedValue({ id: 1, image_url: '/images/x.jpg' });
      fs.writeFileSync.mockImplementation(() => {});
      const req = { params: { id: '1' }, file: { mimetype: 'image/jpeg', size: 1000, originalname: 'x.jpg', buffer: Buffer.from('x') }, user: { cafe_id: 1, role: 'superadmin' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
    it('returns 500 on update error', async () => {
      MenuItem.getById.mockResolvedValue({ id: 1, cafe_id: 1, category_id: 1, name: 'X', price: 5, sort_order: 0, is_available: true, image_url: null, featured_priority: null });
      MenuItem.update.mockRejectedValue(new Error('db'));
      const req = { params: { id: '1' }, file: { mimetype: 'image/jpeg', size: 1000, originalname: 'x.jpg', buffer: Buffer.from('x') }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to upload image' });
    });
  });

  describe('GET /api/promo-banners', () => {
    const handler = getHandler('GET', '/api/promo-banners');
    it('returns 400 when no cafeId', async () => {
      getOrderCafeId.mockReturnValue(null);
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'User must be associated with a cafe' });
    });
    it('returns 200 with banners', async () => {
      getOrderCafeId.mockReturnValue(1);
      PromoBanner.getByCafeId.mockResolvedValue([{ id: 1, image_url: '/images/b1.jpg' }]);
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith([{ id: 1, image_url: '/images/b1.jpg' }]);
    });
  });

  describe('POST /api/promo-banners', () => {
    const handler = getHandler('POST', '/api/promo-banners');
    it('returns 400 when no file', async () => {
      getOrderCafeId.mockReturnValue(1);
      const req = { file: null, body: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'No image file uploaded' });
    });
    it('returns 201 with banner on success', async () => {
      getOrderCafeId.mockReturnValue(1);
      PromoBanner.create.mockResolvedValue({ id: 5, image_url: '/images/promo-banner-1.jpg', cafe_id: 1 });
      const req = { file: { mimetype: 'image/jpeg', size: 1000, originalname: 'b.jpg', buffer: Buffer.from('x') }, body: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: 5, image_url: '/images/promo-banner-1.jpg', cafe_id: 1 });
    });
  });

  describe('PUT /api/promo-banners/:id', () => {
    const handler = getHandler('PUT', '/api/promo-banners/:id');
    it('returns 400 when invalid id', async () => {
      getOrderCafeId.mockReturnValue(1);
      const req = { params: { id: 'x' }, body: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid banner id' });
    });
    it('returns 404 when banner not found', async () => {
      getOrderCafeId.mockReturnValue(1);
      PromoBanner.update.mockResolvedValue(null);
      const req = { params: { id: '1' }, body: { link_url: '/page' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Banner not found' });
    });
    it('returns 200 with updated banner', async () => {
      getOrderCafeId.mockReturnValue(1);
      PromoBanner.update.mockResolvedValue({ id: 1, link_url: '/new', priority: 1 });
      const req = { params: { id: '1' }, body: { link_url: '/new', priority: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ id: 1, link_url: '/new', priority: 1 });
    });
  });

  describe('PATCH /api/promo-banners/:id/image', () => {
    const handler = getHandler('PATCH', '/api/promo-banners/:id/image');
    it('returns 400 when no file', async () => {
      getOrderCafeId.mockReturnValue(1);
      const req = { params: { id: '1' }, file: null, body: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 200 with updated banner on success', async () => {
      getOrderCafeId.mockReturnValue(1);
      PromoBanner.update.mockResolvedValue({ id: 1, image_url: '/images/promo-banner-1-1.jpg' });
      const req = { params: { id: '1' }, file: { mimetype: 'image/jpeg', size: 1000, originalname: 'x.jpg', buffer: Buffer.from('x') }, body: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ id: 1, image_url: '/images/promo-banner-1-1.jpg' });
    });
  });

  describe('DELETE /api/promo-banners/:id', () => {
    const handler = getHandler('DELETE', '/api/promo-banners/:id');
    it('returns 404 when banner not found', async () => {
      getOrderCafeId.mockReturnValue(1);
      PromoBanner.delete.mockResolvedValue(null);
      const req = { params: { id: '1' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Banner not found' });
    });
    it('returns 200 on success', async () => {
      getOrderCafeId.mockReturnValue(1);
      PromoBanner.delete.mockResolvedValue({ success: true });
      const req = { params: { id: '1' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Banner deleted' });
    });
  });

  describe('DELETE /api/cafe-settings/logo', () => {
    const handler = getHandler('DELETE', '/api/cafe-settings/logo');
    it('returns 400 when no cafe_id', async () => {
      const req = { user: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'User must be associated with a cafe' });
    });
    it('returns 200 on success', async () => {
      CafeSettings.updateLogo.mockResolvedValue({ logo_url: null });
      const req = { user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Logo removed successfully' });
    });
  });

  describe('POST /api/cafe-settings/logo', () => {
    const handler = getHandler('POST', '/api/cafe-settings/logo');
    it('returns 400 when no file', async () => {
      const req = { file: null, user: { cafe_id: 1 }, body: {}, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'No logo file uploaded' });
    });
    it('returns 200 with logo_url on success', async () => {
      fs.existsSync.mockReturnValue(true);
      CafeSettings.updateLogo.mockResolvedValue({ logo_url: '/images/cafe-logo-1.png' });
      const req = { file: { mimetype: 'image/png', originalname: 'logo.png', buffer: Buffer.from('x') }, user: { cafe_id: 1 }, body: {}, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, logo_url: expect.any(String), message: 'Logo uploaded successfully' }));
    });
  });

  describe('POST /api/cafe-settings/hero-image', () => {
    const handler = getHandler('POST', '/api/cafe-settings/hero-image');
    it('returns 400 when no file', async () => {
      const req = { file: null, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'No hero image file uploaded' });
    });
    it('returns 200 on success', async () => {
      fs.existsSync.mockReturnValue(true);
      CafeSettings.updateHeroImage.mockResolvedValue({ hero_image_url: '/images/hero.jpg' });
      const req = { file: { mimetype: 'image/jpeg', originalname: 'h.jpg', buffer: Buffer.from('x') }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, hero_image_url: expect.stringMatching(/^\/images\//) }));
    });
  });

  describe('DELETE /api/cafe-settings/hero-image', () => {
    const handler = getHandler('DELETE', '/api/cafe-settings/hero-image');
    it('returns 200 on success', async () => {
      CafeSettings.updateHeroImage.mockResolvedValue({ hero_image_url: null });
      const req = { user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('POST /api/cafe-settings/promo-banner-image', () => {
    const handler = getHandler('POST', '/api/cafe-settings/promo-banner-image');
    it('returns 400 when no file', async () => {
      const req = { file: null, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 200 on success', async () => {
      fs.existsSync.mockReturnValue(true);
      CafeSettings.updatePromoBannerImage.mockResolvedValue({ promo_banner_image_url: '/images/promo.jpg' });
      const req = { file: { mimetype: 'image/jpeg', originalname: 'p.jpg', buffer: Buffer.from('x') }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('DELETE /api/cafe-settings/promo-banner-image', () => {
    const handler = getHandler('DELETE', '/api/cafe-settings/promo-banner-image');
    it('returns 200 on success', async () => {
      CafeSettings.updatePromoBannerImage.mockResolvedValue({ promo_banner_image_url: null });
      const req = { user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('DELETE /api/menu/:id/image', () => {
    const handler = getHandler('DELETE', '/api/menu/:id/image');
    it('returns 404 when menu item not found', async () => {
      MenuItem.getById.mockResolvedValue(null);
      const req = { params: { id: '999' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Menu item not found' });
    });
    it('returns 403 when cafe access denied', async () => {
      MenuItem.getById.mockResolvedValue({ id: 1, cafe_id: 2, image_url: null });
      const req = { params: { id: '1' }, user: { cafe_id: 1, role: 'admin' } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    it('returns 200 and removes image (no image present)', async () => {
      MenuItem.getById.mockResolvedValue({ id: 1, cafe_id: 1, image_url: null });
      MenuItem.update.mockResolvedValue({ id: 1, image_url: null });
      const req = { params: { id: '1' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(MenuItem.update).toHaveBeenCalledWith('1', { image_url: null });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, message: 'Image removed successfully' }));
    });
    it('returns 200 and removes image (deletes file when image present)', async () => {
      MenuItem.getById.mockResolvedValue({ id: 1, cafe_id: 1, image_url: '/images/old.jpg' });
      fs.existsSync.mockReturnValue(true);
      MenuItem.update.mockResolvedValue({ id: 1, image_url: null });
      const req = { params: { id: '1' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
    it('returns 200 when file unlink fails (continue)', async () => {
      MenuItem.getById.mockResolvedValue({ id: 1, cafe_id: 1, image_url: '/images/old.jpg' });
      fs.existsSync.mockReturnValue(true);
      fs.unlinkSync.mockImplementation(() => { throw new Error('file locked'); });
      MenuItem.update.mockResolvedValue({ id: 1, image_url: null });
      const req = { params: { id: '1' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
    it('returns 500 on update error', async () => {
      MenuItem.getById.mockResolvedValue({ id: 1, cafe_id: 1, image_url: null });
      MenuItem.update.mockRejectedValue(new Error('db'));
      const req = { params: { id: '1' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to remove image' });
    });
  });
});
