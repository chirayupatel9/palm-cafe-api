/**
 * Unit tests for Order model. DB and CafeDailyMetrics mocked.
 */
const mockExecute = jest.fn();
const mockGetConnection = jest.fn();
jest.mock('../../../config/database', () => ({
  pool: {
    execute: (...args) => mockExecute(...args),
    getConnection: () => mockGetConnection()
  }
}));
jest.mock('../../../models/cafeDailyMetrics');
jest.mock('../../../config/logger', () => ({ error: jest.fn(), info: jest.fn() }));

const Order = require('../../../models/order');

function mockConn(executeImpl) {
  const conn = {
    execute: executeImpl || jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined)
  };
  mockGetConnection.mockResolvedValue(conn);
  return conn;
}

describe('Order model', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockGetConnection.mockReset();
  });

  describe('getAll', () => {
    it('returns orders with cafeId and maps items', async () => {
      const rows = [{ id: 1, order_number: 'ORD1', total_amount: 10, tax_amount: 1, tip_amount: 0, final_amount: 11, items: [{ id: 1, name: 'Coffee', quantity: 1, price: 10, total_price: 10 }], points_redeemed: 0, points_awarded: false, split_payment: false, split_amount: 0, extra_charge: 0, extra_charge_note: null, cafe_id: 1 }];
      mockExecute.mockResolvedValue([rows]);
      const result = await Order.getAll(1);
      expect(result).toHaveLength(1);
      expect(result[0].total_amount).toBe(10);
      expect(result[0].items).toHaveLength(1);
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('WHERE o.cafe_id = ?'), [1]);
    });
    it('uses limit and offset when provided', async () => {
      mockExecute.mockResolvedValue([[]]);
      await Order.getAll(null, { limit: 10, offset: 5 });
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('LIMIT 10 OFFSET 5'), []);
    });
    it('parses items when string JSON', async () => {
      const rows = [{ id: 1, order_number: 'ORD1', total_amount: 10, tax_amount: 0, tip_amount: 0, final_amount: 10, items: '[{"id":1,"name":"Tea"}]', points_redeemed: 0, points_awarded: false, split_payment: false, split_amount: 0, extra_charge: 0, extra_charge_note: null, cafe_id: null }];
      mockExecute.mockResolvedValue([rows]);
      const result = await Order.getAll(null);
      expect(result[0].items).toHaveLength(1);
      expect(result[0].items[0].name).toBe('Tea');
    });
    it('handles items as single object', async () => {
      const rows = [{ id: 1, order_number: 'ORD1', total_amount: 10, tax_amount: 0, tip_amount: 0, final_amount: 10, items: { id: 1, name: 'Milk' }, points_redeemed: 0, points_awarded: false, split_payment: false, split_amount: 0, extra_charge: 0, extra_charge_note: null, cafe_id: null }];
      mockExecute.mockResolvedValue([rows]);
      const result = await Order.getAll(null);
      expect(result[0].items).toHaveLength(1);
      expect(result[0].items[0].name).toBe('Milk');
    });
    it('handles invalid JSON string for items (catch branch)', async () => {
      const rows = [{ id: 1, order_number: 'ORD1', total_amount: 10, tax_amount: 0, tip_amount: 0, final_amount: 10, items: 'not-json', points_redeemed: 0, points_awarded: false, split_payment: false, split_amount: 0, extra_charge: 0, extra_charge_note: null, cafe_id: null }];
      mockExecute.mockResolvedValue([rows]);
      const result = await Order.getAll(null);
      expect(result[0].items).toEqual([]);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('fail'));
      await expect(Order.getAll(null)).rejects.toThrow('Error fetching orders');
    });
  });

  describe('getById', () => {
    it('returns null when not found', async () => {
      mockExecute.mockResolvedValue([[]]);
      const result = await Order.getById(999);
      expect(result).toBeNull();
    });
    it('returns order with parsed items', async () => {
      const rows = [{ id: 1, order_number: 'ORD1', total_amount: 15, tax_amount: 1, tip_amount: 0, final_amount: 16, items: [{ id: 1, name: 'Latte', quantity: 2, price: 7.5, total_price: 15 }], points_redeemed: 0, points_awarded: false, split_payment: false, split_amount: 0, extra_charge: 0, extra_charge_note: null, cafe_id: 1 }];
      mockExecute.mockResolvedValue([rows]);
      const result = await Order.getById(1, 1);
      expect(result.id).toBe(1);
      expect(result.final_amount).toBe(16);
      expect(result.items).toHaveLength(1);
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('AND o.cafe_id = ?'), [1, 1]);
    });
    it('filters by cafeId when provided', async () => {
      mockExecute.mockResolvedValue([[]]);
      await Order.getById(1, 2);
      expect(mockExecute).toHaveBeenCalledWith(expect.any(String), [1, 2]);
    });
    it('parses items when string JSON in getById', async () => {
      const rows = [{ id: 1, order_number: 'ORD1', total_amount: 15, tax_amount: 0, tip_amount: 0, final_amount: 15, items: '[{"id":2,"name":"Latte"}]', points_redeemed: 0, points_awarded: false, split_payment: false, split_amount: 0, extra_charge: 0, extra_charge_note: null, cafe_id: null }];
      mockExecute.mockResolvedValue([rows]);
      const result = await Order.getById(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Latte');
    });
    it('handles items as single object in getById', async () => {
      const rows = [{ id: 1, order_number: 'ORD1', total_amount: 10, tax_amount: 0, tip_amount: 0, final_amount: 10, items: { id: 3, name: 'Mocha' }, points_redeemed: 0, points_awarded: false, split_payment: false, split_amount: 0, extra_charge: 0, extra_charge_note: null, cafe_id: null }];
      mockExecute.mockResolvedValue([rows]);
      const result = await Order.getById(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Mocha');
    });
    it('handles invalid JSON string for items in getById (catch branch)', async () => {
      const rows = [{ id: 1, order_number: 'ORD1', total_amount: 10, tax_amount: 0, tip_amount: 0, final_amount: 10, items: 'invalid', points_redeemed: 0, points_awarded: false, split_payment: false, split_amount: 0, extra_charge: 0, extra_charge_note: null, cafe_id: null }];
      mockExecute.mockResolvedValue([rows]);
      const result = await Order.getById(1);
      expect(result.items).toEqual([]);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('fail'));
      await expect(Order.getById(1)).rejects.toThrow('Error fetching order');
    });
  });

  describe('create', () => {
    it('inserts order and items and returns getById result', async () => {
      const conn = mockConn();
      conn.execute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 100 }])
        .mockResolvedValueOnce([{ affectedRows: 2 }]);
      mockExecute.mockResolvedValue([[{ id: 100, order_number: 'ORD1', total_amount: 20, tax_amount: 0, tip_amount: 0, final_amount: 20, items: [], points_redeemed: 0, points_awarded: false, split_payment: false, split_amount: 0, extra_charge: 0, extra_charge_note: null, cafe_id: null, created_at: new Date() }]]);
      const result = await Order.create({
        items: [{ menu_item_id: 1, name: 'A', quantity: 2, price: 10, total: 20 }],
        total_amount: 20,
        final_amount: 20
      });
      expect(result.id).toBe(100);
      expect(conn.commit).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });
    it('includes cafe_id when orderData.cafe_id provided and column exists', async () => {
      const conn = mockConn();
      conn.execute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([{ insertId: 101 }]);
      mockExecute.mockResolvedValue([[{ id: 101, order_number: 'ORD1', total_amount: 10, tax_amount: 0, tip_amount: 0, final_amount: 10, items: [], points_redeemed: 0, points_awarded: false, split_payment: false, split_amount: 0, extra_charge: 0, extra_charge_note: null, cafe_id: 2, created_at: new Date() }]]);
      const result = await Order.create({ items: [], total_amount: 10, final_amount: 10, cafe_id: 2 });
      expect(result.id).toBe(101);
      expect(conn.execute).toHaveBeenNthCalledWith(2, expect.stringContaining('cafe_id'), expect.arrayContaining([2]));
    });
    it('rolls back and throws on error', async () => {
      const conn = mockConn();
      conn.execute.mockResolvedValueOnce([[]]).mockRejectedValueOnce(new Error('insert fail'));
      await expect(Order.create({ items: [], total_amount: 10, final_amount: 10 })).rejects.toThrow('Error creating order');
      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('throws when order not found', async () => {
      mockExecute.mockResolvedValue([[]]);
      await expect(Order.updateStatus(999)).rejects.toThrow('Order not found');
    });
    it('returns updated order when found', async () => {
      const orderRow = { id: 1, status: 'pending', final_amount: 25, created_at: new Date(), cafe_id: 1 };
      mockExecute
        .mockResolvedValueOnce([[orderRow]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ ...orderRow, status: 'completed' }]]);
      const result = await Order.updateStatus(1, 'completed', 1);
      expect(result.status).toBe('completed');
      expect(mockExecute).toHaveBeenNthCalledWith(2, expect.stringContaining('SET status'), ['completed', 1, 1]);
    });
    it('throws when UPDATE returns affectedRows 0', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ id: 1, status: 'pending', final_amount: 10, created_at: new Date(), cafe_id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 0 }]);
      await expect(Order.updateStatus(1, 'completed', 1)).rejects.toThrow('Order not found');
    });
    it('throws on DB error', async () => {
      mockExecute.mockResolvedValueOnce([[{ id: 1, status: 'pending' }]]).mockRejectedValue(new Error('fail'));
      await expect(Order.updateStatus(1, 'completed')).rejects.toThrow('Error updating order status');
    });
  });

  describe('update', () => {
    it('throws when order not found', async () => {
      const conn = mockConn();
      conn.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      await expect(Order.update(999, { total_amount: 10, final_amount: 10 })).rejects.toThrow('Order not found');
    });
    it('updates order and items when items array provided', async () => {
      const conn = mockConn();
      conn.execute
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockExecute.mockResolvedValue([[{ id: 1, order_number: 'ORD1', total_amount: 30, items: [], points_redeemed: 0, points_awarded: false, split_payment: false, split_amount: 0, extra_charge: 0, extra_charge_note: null, cafe_id: null }]]);
      const result = await Order.update(1, { total_amount: 30, final_amount: 30, items: [{ name: 'B', quantity: 1, price: 30, total: 30 }] }, null);
      expect(result).toHaveProperty('id', 1);
      expect(conn.execute).toHaveBeenCalledWith('DELETE FROM order_items WHERE order_id = ?', [1]);
    });
    it('updates order without items (no items branch)', async () => {
      const conn = mockConn();
      conn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockExecute.mockResolvedValue([[{ id: 1, order_number: 'ORD1', total_amount: 25, items: [], points_redeemed: 0, points_awarded: false, split_payment: false, split_amount: 0, extra_charge: 0, extra_charge_note: null, cafe_id: 2 }]]);
      const result = await Order.update(1, { total_amount: 25, final_amount: 25 }, 2);
      expect(result.id).toBe(1);
      expect(conn.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('markPointsAwarded', () => {
    it('throws when order not found', async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      await expect(Order.markPointsAwarded(999)).rejects.toThrow('Order not found');
    });
    it('returns order when updated', async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ id: 1, points_awarded: true }]]);
      const result = await Order.markPointsAwarded(1);
      expect(result.points_awarded).toBe(true);
    });
  });

  describe('getByCustomerPhone', () => {
    it('returns orders for phone with cafeId', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, order_number: 'ORD1', total_amount: 10, tax_amount: 0, tip_amount: 0, final_amount: 10, items: [], cafe_id: 1 }]]);
      const result = await Order.getByCustomerPhone('+123', 1);
      expect(result).toHaveLength(1);
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('customer_phone'), ['+123', 1]);
    });
    it('returns orders without cafeId', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, order_number: 'ORD1', total_amount: 10, tax_amount: 0, tip_amount: 0, final_amount: 10, items: [], cafe_id: null }]]);
      const result = await Order.getByCustomerPhone('+123');
      expect(result).toHaveLength(1);
      expect(mockExecute).toHaveBeenCalledWith(expect.any(String), ['+123']);
    });
    it('maps items when string JSON', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, order_number: 'ORD1', total_amount: 10, tax_amount: 0, tip_amount: 0, final_amount: 10, items: '[{"id":1,"name":"X"}]', cafe_id: null }]]);
      const r1 = await Order.getByCustomerPhone('+1');
      expect(r1[0].items).toHaveLength(1);
      expect(r1[0].items[0].name).toBe('X');
    });
    it('maps items when single object', async () => {
      mockExecute.mockResolvedValue([[{ id: 2, order_number: 'ORD2', total_amount: 5, tax_amount: 0, tip_amount: 0, final_amount: 5, items: { id: 2, name: 'Y' }, cafe_id: null }]]);
      const r2 = await Order.getByCustomerPhone('+2');
      expect(r2[0].items).toHaveLength(1);
      expect(r2[0].items[0].name).toBe('Y');
    });
    it('handles invalid JSON for items in getByCustomerPhone', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, order_number: 'ORD1', total_amount: 10, tax_amount: 0, tip_amount: 0, final_amount: 10, items: 'not-json', cafe_id: null }]]);
      const result = await Order.getByCustomerPhone('+1');
      expect(result[0].items).toEqual([]);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('fail'));
      await expect(Order.getByCustomerPhone('+1')).rejects.toThrow('Error fetching orders by customer phone');
    });
  });

  describe('getByOrderNumber', () => {
    it('returns orders for order number', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, order_number: 'ORD99', total_amount: 5, tax_amount: 0, tip_amount: 0, final_amount: 5, items: [] }]]);
      const result = await Order.getByOrderNumber('ORD99');
      expect(result).toHaveLength(1);
      expect(result[0].order_number).toBe('ORD99');
    });
    it('returns orders with cafeId', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, order_number: 'ORD99', total_amount: 5, tax_amount: 0, tip_amount: 0, final_amount: 5, items: [], cafe_id: 1 }]]);
      const result = await Order.getByOrderNumber('ORD99', 1);
      expect(result).toHaveLength(1);
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('order_number'), ['ORD99', 1]);
    });
    it('maps items when array', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, order_number: 'ORD1', total_amount: 10, tax_amount: 0, tip_amount: 0, final_amount: 10, items: [{ id: 1, name: 'Z' }], cafe_id: null }]]);
      const result = await Order.getByOrderNumber('ORD1');
      expect(result[0].items).toHaveLength(1);
      expect(result[0].items[0].name).toBe('Z');
    });
    it('handles invalid JSON for items in getByOrderNumber', async () => {
      mockExecute.mockResolvedValue([[{ id: 2, order_number: 'ORD2', total_amount: 5, tax_amount: 0, tip_amount: 0, final_amount: 5, items: 'bad', cafe_id: null }]]);
      const r2 = await Order.getByOrderNumber('ORD2');
      expect(r2[0].items).toEqual([]);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('fail'));
      await expect(Order.getByOrderNumber('ORD1')).rejects.toThrow('Error fetching orders by order number');
    });
  });

  describe('getByStatus', () => {
    it('returns orders for status', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, status: 'pending', total_amount: 10, tax_amount: 0, tip_amount: 0, final_amount: 10, items: [] }]]);
      const result = await Order.getByStatus('pending', 1);
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('pending');
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('WHERE o.status = ?'), ['pending', 1]);
    });
    it('returns orders without cafeId', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, status: 'completed', total_amount: 20, tax_amount: 0, tip_amount: 0, final_amount: 20, items: [], cafe_id: null }]]);
      const result = await Order.getByStatus('completed');
      expect(result).toHaveLength(1);
      expect(mockExecute).toHaveBeenCalledWith(expect.any(String), ['completed']);
    });
    it('maps items when string JSON in getByStatus', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, status: 'pending', total_amount: 10, tax_amount: 0, tip_amount: 0, final_amount: 10, items: '[{"id":1,"name":"A"}]', cafe_id: null }]]);
      const r1 = await Order.getByStatus('pending');
      expect(r1[0].items).toHaveLength(1);
      expect(r1[0].items[0].name).toBe('A');
    });
    it('maps items when single object in getByStatus', async () => {
      mockExecute.mockResolvedValue([[{ id: 2, status: 'ready', total_amount: 5, tax_amount: 0, tip_amount: 0, final_amount: 5, items: { id: 2, name: 'W' }, cafe_id: null }]]);
      const r2 = await Order.getByStatus('ready');
      expect(r2[0].items).toHaveLength(1);
      expect(r2[0].items[0].name).toBe('W');
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('fail'));
      await expect(Order.getByStatus('completed')).rejects.toThrow('Error fetching orders by status');
    });
  });

  describe('getStatistics', () => {
    it('returns counts for cafeId', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ count: 10 }]])
        .mockResolvedValueOnce([[{ count: 3 }]])
        .mockResolvedValueOnce([[{ count: 2 }]])
        .mockResolvedValueOnce([[{ count: 1 }]])
        .mockResolvedValueOnce([[{ count: 4 }]]);
      const result = await Order.getStatistics(1);
      expect(result).toEqual({ total: 10, pending: 3, preparing: 2, ready: 1, completed: 4 });
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('WHERE cafe_id = ?'), [1]);
    });
    it('returns counts without cafeId', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ count: 5 }]])
        .mockResolvedValueOnce([[{ count: 1 }]])
        .mockResolvedValueOnce([[{ count: 1 }]])
        .mockResolvedValueOnce([[{ count: 1 }]])
        .mockResolvedValueOnce([[{ count: 2 }]]);
      const result = await Order.getStatistics(null);
      expect(result.total).toBe(5);
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('SELECT COUNT(*)'), []);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('fail'));
      await expect(Order.getStatistics(1)).rejects.toThrow('Error fetching order statistics');
    });
  });
});
