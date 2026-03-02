/**
 * Unit tests for routes/cafe.js. Invoice, Order, Customer, Cafe, TaxSettings, pool, pdfService mocked.
 */
jest.mock('../../../models/invoice');
jest.mock('../../../models/order');
jest.mock('../../../models/customer');
jest.mock('../../../models/cafe');
jest.mock('../../../models/taxSettings');
jest.mock('../../../config/database', () => ({
  pool: { execute: jest.fn() }
}));
jest.mock('../../../services/pdfService');
jest.mock('../../../middleware/auth', () => ({ auth: (req, res, next) => next() }));
jest.mock('../../../routes/helpers', () => ({
  getOrderCafeId: jest.fn(),
  requireOrderCafeScope: (req, res, next) => next(),
  parseListLimitOffset: jest.fn().mockReturnValue({ limit: null, offset: 0 })
}));
jest.mock('../../../config/logger', () => ({ error: jest.fn() }));

const { getOrderCafeId, parseListLimitOffset } = require('../../../routes/helpers');
const Invoice = require('../../../models/invoice');
const Order = require('../../../models/order');
const Customer = require('../../../models/customer');
const Cafe = require('../../../models/cafe');
const TaxSettings = require('../../../models/taxSettings');
const pdfService = require('../../../services/pdfService');
const { pool } = require('../../../config/database');

const routes = {};
const mockApp = {
  get: (path, ...fns) => { routes[`GET ${path}`] = fns; },
  post: (path, ...fns) => { routes[`POST ${path}`] = fns; }
};
require('../../../routes/cafe')(mockApp);

function getHandler(method, path) {
  const stack = routes[`${method} ${path}`];
  return stack ? stack[stack.length - 1] : null;
}

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

describe('routes/cafe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOrderCafeId.mockReturnValue(1);
    parseListLimitOffset.mockReturnValue({ limit: null, offset: 0 });
  });

  describe('GET /api/invoices', () => {
    const handler = getHandler('GET', '/api/invoices');
    it('returns 200 with invoice list', async () => {
      Invoice.getAll.mockResolvedValue([{ id: 1, invoice_number: 'INV-001' }]);
      const req = { user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(Invoice.getAll).toHaveBeenCalledWith(1, {});
      expect(res.json).toHaveBeenCalledWith([{ id: 1, invoice_number: 'INV-001' }]);
    });
    it('passes list options when limit provided', async () => {
      parseListLimitOffset.mockReturnValue({ limit: 10, offset: 0 });
      Invoice.getAll.mockResolvedValue([]);
      const req = { user: { cafe_id: 1 }, query: { limit: '10' } };
      const res = mockRes();
      await handler(req, res);
      expect(Invoice.getAll).toHaveBeenCalledWith(1, { limit: 10, offset: 0 });
    });
    it('returns 500 on error', async () => {
      Invoice.getAll.mockRejectedValue(new Error('db'));
      const req = { user: { cafe_id: 1 }, query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch invoices' });
    });
  });

  describe('POST /api/invoices', () => {
    const handler = getHandler('POST', '/api/invoices');
    it('returns 400 when customer name missing', async () => {
      const req = { body: { items: [{ id: 1, name: 'Coffee', quantity: 1, price: 10 }] }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Customer name and items are required' });
    });
    it('returns 400 when items missing or empty', async () => {
      const req = { body: { customerName: 'John', items: [] }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    it('returns 400 when no cafeId', async () => {
      getOrderCafeId.mockReturnValue(null);
      const req = { body: { customerName: 'J', items: [{ id: 1, name: 'T', quantity: 1, price: 5 }] }, user: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unable to determine cafe. Please ensure you are logged in and belong to a cafe.' });
    });
    it('returns 403 when split payment and user not admin', async () => {
      TaxSettings.calculateTax.mockResolvedValue({ taxAmount: 0, taxRate: 0, taxName: 'GST' });
      Invoice.getNextInvoiceNumber.mockResolvedValue('INV-1');
      Customer.findByEmailOrPhone.mockResolvedValue(null);
      Order.create.mockResolvedValue({ id: 1, order_number: 'ORD1', cafe_id: 1 });
      const req = {
        body: {
          customerName: 'J',
          items: [{ id: 1, name: 'T', quantity: 1, price: 10 }],
          splitPayment: true,
          splitAmount: 5
        },
        user: { cafe_id: 1, role: 'user' }
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Split payment is only available for administrators' });
    });
    it('returns 400 when split amount invalid', async () => {
      TaxSettings.calculateTax.mockResolvedValue({ taxAmount: 0, taxRate: 0, taxName: 'GST' });
      Invoice.getNextInvoiceNumber.mockResolvedValue('INV-1');
      Customer.findByEmailOrPhone.mockResolvedValue(null);
      Order.create.mockResolvedValue({ id: 1, order_number: 'ORD1', cafe_id: 1 });
      const req = {
        body: {
          customerName: 'J',
          items: [{ id: 1, name: 'T', quantity: 1, price: 10 }],
          splitPayment: true,
          splitAmount: 0
        },
        user: { cafe_id: 1, role: 'admin' }
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Split payment amount must be greater than 0' });
    });
    it('returns 400 when split amount >= total', async () => {
      TaxSettings.calculateTax.mockResolvedValue({ taxAmount: 0, taxRate: 0, taxName: 'GST' });
      Invoice.getNextInvoiceNumber.mockResolvedValue('INV-1');
      Customer.findByEmailOrPhone.mockResolvedValue(null);
      Order.create.mockResolvedValue({ id: 1, order_number: 'ORD1', cafe_id: 1 });
      const req = {
        body: {
          customerName: 'J',
          items: [{ id: 1, name: 'T', quantity: 1, price: 10 }],
          splitPayment: true,
          splitAmount: 10
        },
        user: { cafe_id: 1, role: 'admin' }
      };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Split payment amount cannot be greater than or equal to total amount' });
    });
    it('creates customer when phone provided and customer not found', async () => {
      TaxSettings.calculateTax.mockResolvedValue({ taxAmount: 0, taxRate: 0, taxName: 'GST' });
      Invoice.getNextInvoiceNumber.mockResolvedValue('INV-1');
      Customer.findByEmailOrPhone.mockResolvedValue(null);
      Customer.create.mockResolvedValue({ id: 50, name: 'New', phone: '+123' });
      Order.create.mockResolvedValue({ id: 1, order_number: 'ORD1', cafe_id: 1 });
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);
      const req = {
        body: {
          customerName: 'New',
          customerPhone: '+123',
          items: [{ id: 1, name: 'T', quantity: 1, price: 10 }]
        },
        user: { cafe_id: 1 }
      };
      const res = mockRes();
      await handler(req, res);
      expect(Customer.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'New', phone: '+123', cafe_id: 1 }));
      expect(pool.execute).toHaveBeenCalledWith('UPDATE orders SET customer_id = ? WHERE id = ?', [50, 1]);
    });
    it('returns 200 with invoiceNumber and orderNumber on success', async () => {
      TaxSettings.calculateTax.mockResolvedValue({ taxAmount: 0, taxRate: 0, taxName: 'GST' });
      Invoice.getNextInvoiceNumber.mockResolvedValue('INV-100');
      Customer.findByEmailOrPhone.mockResolvedValue(null);
      Order.create.mockResolvedValue({ id: 1, order_number: 'ORD1', cafe_id: 1 });
      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);
      const req = {
        body: {
          customerName: 'Jane',
          items: [{ id: 1, name: 'Tea', quantity: 2, price: 5 }]
        },
        user: { cafe_id: 1 }
      };
      const res = mockRes();
      await handler(req, res);
      expect(Order.create).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        invoiceNumber: 'INV-100',
        orderNumber: 'ORD1'
      }));
    });
    it('returns 500 on error', async () => {
      TaxSettings.calculateTax.mockResolvedValue({ taxAmount: 0 });
      Invoice.getNextInvoiceNumber.mockResolvedValue('INV-1');
      Order.create.mockRejectedValue(new Error('db'));
      const req = { body: { customerName: 'J', items: [{ id: 1, name: 'T', quantity: 1, price: 10 }] }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create invoice' });
    });
  });

  describe('POST /api/invoices/generate', () => {
    const handler = getHandler('POST', '/api/invoices/generate');
    it('returns 400 when order_id missing', async () => {
      const req = { body: {}, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'order_id is required' });
    });
    it('returns 404 when order not found', async () => {
      Order.getById.mockResolvedValue(null);
      const req = { body: { order_id: 999 }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Order not found' });
    });
    it('returns existing invoice number when invoice already exists', async () => {
      Order.getById.mockResolvedValue({ id: 1, order_number: 'ORD1' });
      Invoice.getByOrderNumber.mockResolvedValue({ invoice_number: 'INV-EXISTING' });
      const req = { body: { order_id: 1 }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ invoiceNumber: 'INV-EXISTING' });
      expect(Invoice.create).not.toHaveBeenCalled();
    });
    it('returns 201 with new invoice number on success', async () => {
      Order.getById.mockResolvedValue({
        id: 1, order_number: 'ORD1', customer_name: 'J', customer_phone: null,
        total_amount: 20, tax_amount: 0, tip_amount: 0, final_amount: 20,
        payment_method: 'cash', created_at: new Date(), items: [{ menu_item_id: 1, name: 'C', quantity: 1, price: 20, total: 20 }]
      });
      Invoice.getByOrderNumber.mockResolvedValue(null);
      Invoice.getNextInvoiceNumber.mockResolvedValue('INV-NEW');
      Invoice.create.mockResolvedValue({});
      const req = { body: { order_id: 1 }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(Invoice.create).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ invoiceNumber: 'INV-NEW' });
    });
    it('returns 500 on error', async () => {
      Order.getById.mockRejectedValue(new Error('db'));
      const req = { body: { order_id: 1 }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to generate invoice' });
    });
  });

  describe('GET /api/invoices/:invoiceNumber/pdf', () => {
    const handler = getHandler('GET', '/api/invoices/:invoiceNumber/pdf');
    it('returns 404 when invoice not found', async () => {
      Invoice.getByNumber.mockResolvedValue(null);
      const req = { params: { invoiceNumber: 'INV-999' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invoice not found' });
    });
    it('returns 200 with pdf and success', async () => {
      Invoice.getByNumber.mockResolvedValue({ invoice_number: 'INV-1', id: 1 });
      pdfService.generatePDF.mockResolvedValue('base64pdf');
      const req = { params: { invoiceNumber: 'INV-1' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        pdf: 'base64pdf',
        invoiceNumber: 'INV-1'
      });
    });
    it('returns 500 when PDF generation fails', async () => {
      Invoice.getByNumber.mockResolvedValue({ invoice_number: 'INV-1' });
      pdfService.generatePDF.mockRejectedValue(new Error('pdf fail'));
      const req = { params: { invoiceNumber: 'INV-1' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to generate PDF' });
    });
  });

  describe('GET /api/invoices/:invoiceNumber/download', () => {
    const handler = getHandler('GET', '/api/invoices/:invoiceNumber/download');
    it('returns 404 when invoice not found', async () => {
      Invoice.getByNumber.mockResolvedValue(null);
      const req = { params: { invoiceNumber: 'INV-999' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    it('returns 200 with pdf', async () => {
      Invoice.getByNumber.mockResolvedValue({ invoice_number: 'INV-1' });
      pdfService.generatePDF.mockResolvedValue('base64pdf');
      const req = { params: { invoiceNumber: 'INV-1' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ pdf: 'base64pdf' });
    });
    it('returns 500 on PDF error', async () => {
      Invoice.getByNumber.mockResolvedValue({ invoice_number: 'INV-1' });
      pdfService.generatePDF.mockRejectedValue(new Error('pdf'));
      const req = { params: { invoiceNumber: 'INV-1' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to generate PDF' });
    });
  });

  describe('GET /api/invoices/order/:orderNumber', () => {
    const handler = getHandler('GET', '/api/invoices/order/:orderNumber');
    it('returns 404 when invoice not found for order', async () => {
      Invoice.getByOrderNumber.mockResolvedValue(null);
      const req = { params: { orderNumber: 'ORD999' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invoice not found for this order' });
    });
    it('returns 200 with invoice', async () => {
      Invoice.getByOrderNumber.mockResolvedValue({ id: 1, invoice_number: 'INV-1' });
      const req = { params: { orderNumber: 'ORD1' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ id: 1, invoice_number: 'INV-1' });
    });
    it('returns 500 on error', async () => {
      Invoice.getByOrderNumber.mockRejectedValue(new Error('db'));
      const req = { params: { orderNumber: 'ORD1' }, user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch invoice' });
    });
  });

  describe('GET /api/statistics', () => {
    const handler = getHandler('GET', '/api/statistics');
    it('returns 200 with statistics', async () => {
      Invoice.getStatistics.mockResolvedValue({ totalInvoices: 10, totalRevenue: 1000 });
      const req = { user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(Invoice.getStatistics).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith({ totalInvoices: 10, totalRevenue: 1000 });
    });
    it('returns 500 on error', async () => {
      Invoice.getStatistics.mockRejectedValue(new Error('db'));
      const req = { user: { cafe_id: 1 } };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch statistics' });
    });
  });

  describe('GET /api/reports/daily', () => {
    const handler = getHandler('GET', '/api/reports/daily');
    it('returns 200 with daily data and totals', async () => {
      pool.execute.mockResolvedValue([[
        { date: '2025-01-01', orders: 5, earnings: 100 },
        { date: '2025-01-02', orders: 3, earnings: 60 }
      ]]);
      const req = { query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        dailyData: expect.any(Array),
        totalEarnings: 160,
        totalOrders: 8
      }));
    });
    it('uses query.days when provided', async () => {
      pool.execute.mockResolvedValue([[]]);
      const req = { query: { days: '14' } };
      const res = mockRes();
      await handler(req, res);
      expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('INTERVAL ? DAY'), [14]);
    });
    it('returns 500 on error', async () => {
      pool.execute.mockRejectedValue(new Error('db'));
      const req = { query: {} };
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch daily reports' });
    });
  });

  describe('GET /api/reports/top-items', () => {
    const handler = getHandler('GET', '/api/reports/top-items');
    it('returns 200 with topItems', async () => {
      pool.execute.mockResolvedValue([[{ id: 1, name: 'Coffee', category: 'Drinks', total_orders: 10, total_revenue: 50 }]]);
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.json).toHaveBeenCalledWith({
        topItems: [{ id: 1, name: 'Coffee', category: 'Drinks', total_orders: 10, total_revenue: 50 }]
      });
    });
    it('returns 500 on error', async () => {
      pool.execute.mockRejectedValue(new Error('db'));
      const req = {};
      const res = mockRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch top items' });
    });
  });
});
