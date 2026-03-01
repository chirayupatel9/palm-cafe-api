/**
 * Unit tests for Invoice model. DB mocked.
 */
const mockExecute = jest.fn();
const mockGetConnection = jest.fn();
jest.mock('../../../config/database', () => ({
  pool: {
    execute: (...args) => mockExecute(...args),
    getConnection: () => mockGetConnection()
  }
}));

const Invoice = require('../../../models/invoice');

function mockConn(executeImpl) {
  const conn = {
    execute: executeImpl || jest.fn(),
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined)
  };
  mockGetConnection.mockResolvedValue(conn);
  return conn;
}

describe('Invoice model', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockGetConnection.mockReset();
  });

  describe('getAll', () => {
    it('returns invoices with items when columns include cafe_id and totals', async () => {
      const cols = ['invoice_number', 'order_id', 'cafe_id', 'customer_name', 'customer_phone', 'payment_method',
        'subtotal', 'tax_amount', 'tip_amount', 'total_amount', 'invoice_date', 'created_at'].map(c => ({ COLUMN_NAME: c }));
      mockExecute
        .mockResolvedValueOnce([cols])
        .mockResolvedValueOnce([[{ invoice_number: '101', customer_name: 'A', subtotal: 10, tax_amount: 1, tip_amount: 0, total_amount: 11, invoice_date: '2025-01-01', cafe_id: 1 }]])
        .mockResolvedValueOnce([[{ menu_item_id: 1, item_name: 'Coffee', price: 5, quantity: 2, total: 10 }]]);
      const result = await Invoice.getAll(1);
      expect(result).toHaveLength(1);
      expect(result[0].customer_name).toBe('A');
      expect(result[0].items).toHaveLength(1);
      expect(result[0].items[0].price).toBe(5);
    });
    it('returns empty array when no invoices', async () => {
      const cols = ['invoice_number', 'customer_name', 'created_at'].map(c => ({ COLUMN_NAME: c }));
      mockExecute.mockResolvedValueOnce([cols]).mockResolvedValueOnce([[]]);
      const result = await Invoice.getAll(null);
      expect(result).toEqual([]);
    });
    it('applies limit and offset when provided', async () => {
      const cols = ['invoice_number', 'customer_name', 'created_at', 'total_amount'].map(c => ({ COLUMN_NAME: c }));
      mockExecute.mockResolvedValueOnce([cols]).mockResolvedValueOnce([[{ invoice_number: '1', customer_name: 'X', created_at: null, total_amount: 10 }]]).mockResolvedValueOnce([[]]);
      await Invoice.getAll(null, { limit: 5, offset: 2 });
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('LIMIT 5 OFFSET 2'), expect.any(Array));
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('DB fail'));
      await expect(Invoice.getAll(null)).rejects.toThrow('Error fetching invoices');
    });
  });

  describe('getByNumber', () => {
    it('returns null when not found', async () => {
      const cols = ['invoice_number', 'customer_name', 'subtotal', 'tax_amount', 'tip_amount', 'total_amount'].map(c => ({ COLUMN_NAME: c }));
      mockExecute
        .mockResolvedValueOnce([cols])
        .mockResolvedValueOnce([[]]);
      const result = await Invoice.getByNumber('999');
      expect(result).toBeNull();
    });
    it('returns invoice with items when found', async () => {
      const cols = ['invoice_number', 'order_id', 'cafe_id', 'customer_name', 'subtotal', 'tax_amount', 'tip_amount', 'total_amount', 'invoice_date', 'created_at'].map(c => ({ COLUMN_NAME: c }));
      mockExecute
        .mockResolvedValueOnce([cols])
        .mockResolvedValueOnce([[{ invoice_number: '102', customer_name: 'B', subtotal: 20, tax_amount: 2, tip_amount: 1, total_amount: 23 }]])
        .mockResolvedValueOnce([[{ menu_item_id: 2, item_name: 'Tea', price: 3, quantity: 1, total: 3 }]]);
      const result = await Invoice.getByNumber('102');
      expect(result).not.toBeNull();
      expect(result.customer_name).toBe('B');
      expect(result.items).toHaveLength(1);
    });
  });

  describe('getByOrderNumber', () => {
    it('returns null when order_id column does not exist', async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      const result = await Invoice.getByOrderNumber('ORD-1');
      expect(result).toBeNull();
    });
    it('returns null when no invoice found for order', async () => {
      const cols = ['invoice_number', 'order_id', 'customer_name', 'subtotal', 'tax_amount', 'tip_amount', 'total_amount', 'invoice_date', 'created_at', 'order_number'].map(c => ({ COLUMN_NAME: c }));
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'order_id' }]])
        .mockResolvedValueOnce([cols])
        .mockResolvedValueOnce([[]]);
      const result = await Invoice.getByOrderNumber('ORD-999');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('inserts invoice and items and returns summary', async () => {
      const conn = mockConn();
      conn.execute
        .mockResolvedValueOnce([[
          { COLUMN_NAME: 'invoice_number' }, { COLUMN_NAME: 'order_id' }, { COLUMN_NAME: 'cafe_id' },
          { COLUMN_NAME: 'customer_name' }, { COLUMN_NAME: 'customer_phone' }, { COLUMN_NAME: 'payment_method' },
          { COLUMN_NAME: 'subtotal' }, { COLUMN_NAME: 'tax_amount' }, { COLUMN_NAME: 'tip_amount' },
          { COLUMN_NAME: 'total_amount' }, { COLUMN_NAME: 'invoice_date' }
        ]])
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([{}]);
      const items = [{ id: 1, name: 'Latte', price: 4.5, quantity: 1, total: 4.5 }];
      const result = await Invoice.create({
        invoiceNumber: '201',
        order_id: 10,
        cafe_id: 1,
        customerName: 'C',
        customerPhone: null,
        paymentMethod: 'cash',
        items,
        subtotal: 4.5,
        taxAmount: 0,
        tipAmount: 0,
        total: 4.5,
        date: '2025-01-15T10:00:00.000Z'
      });
      expect(result.invoiceNumber).toBe('201');
      expect(result.customerName).toBe('C');
      expect(result.items).toEqual(items);
      expect(conn.commit).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });
    it('rolls back and throws on error', async () => {
      const conn = mockConn();
      conn.execute.mockResolvedValueOnce([[{ COLUMN_NAME: 'invoice_number' }, { COLUMN_NAME: 'customer_name' }, { COLUMN_NAME: 'total_amount' }, { COLUMN_NAME: 'date' }]]).mockRejectedValueOnce(new Error('Insert failed'));
      await expect(Invoice.create({
        invoiceNumber: '202',
        customerName: 'D',
        items: [],
        subtotal: 0,
        taxAmount: 0,
        tipAmount: 0,
        total: 0
      })).rejects.toThrow('Error creating invoice');
      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });
  });

  describe('getNextInvoiceNumber', () => {
    it('returns max+1 as string', async () => {
      mockExecute.mockResolvedValueOnce([[{ maxNumber: 100 }]]);
      const result = await Invoice.getNextInvoiceNumber();
      expect(result).toBe('101');
    });
    it('returns 1000 when no rows (maxNumber null)', async () => {
      mockExecute.mockResolvedValueOnce([[{ maxNumber: null }]]);
      const result = await Invoice.getNextInvoiceNumber();
      expect(result).toBe('1000'); // 999 + 1
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('DB fail'));
      await expect(Invoice.getNextInvoiceNumber()).rejects.toThrow('Error getting next invoice number');
    });
  });

  describe('getStatistics', () => {
    it('returns stats when cafe_id and amount columns exist', async () => {
      const cols = ['invoice_number', 'cafe_id', 'total_amount', 'tip_amount', 'tax_amount'].map(c => ({ COLUMN_NAME: c }));
      mockExecute
        .mockResolvedValueOnce([cols])
        .mockResolvedValueOnce([[{ totalRevenue: 500 }]])
        .mockResolvedValueOnce([[{ totalOrders: 10 }]])
        .mockResolvedValueOnce([[{ uniqueCustomers: 5 }]])
        .mockResolvedValueOnce([[{ totalTips: 20 }]])
        .mockResolvedValueOnce([[{ totalTax: 50 }]]);
      const result = await Invoice.getStatistics(1);
      expect(result.totalRevenue).toBe(500);
      expect(result.totalOrders).toBe(10);
      expect(result.uniqueCustomers).toBe(5);
      expect(result.totalTips).toBe(20);
      expect(result.totalTax).toBe(50);
    });
    it('returns zero stats when no cafe_id filter and empty results', async () => {
      const cols = ['invoice_number', 'total_amount'].map(c => ({ COLUMN_NAME: c }));
      mockExecute
        .mockResolvedValueOnce([cols])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]]);
      const result = await Invoice.getStatistics(null);
      expect(result.totalRevenue).toBe(0);
      expect(result.totalOrders).toBe(0);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('DB fail'));
      await expect(Invoice.getStatistics(null)).rejects.toThrow('Error fetching statistics');
    });
  });
});
