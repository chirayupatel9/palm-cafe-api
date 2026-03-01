/**
 * Unit tests for CafeDailyMetrics model. DB mocked.
 */
const mockExecute = jest.fn();
jest.mock('../../../config/database', () => ({
  pool: { execute: (...args) => mockExecute(...args) }
}));

jest.mock('../../../config/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));

const CafeDailyMetrics = require('../../../models/cafeDailyMetrics');

describe('CafeDailyMetrics', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  describe('getOrCreate', () => {
    it('returns existing row when found', async () => {
      const row = { id: 1, cafe_id: 1, date: '2025-01-15', total_orders: 5 };
      mockExecute.mockResolvedValueOnce([[row]]);
      const result = await CafeDailyMetrics.getOrCreate(1, '2025-01-15');
      expect(result).toEqual(row);
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
    it('creates and returns new metrics when not found', async () => {
      mockExecute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 10 }]);
      const result = await CafeDailyMetrics.getOrCreate(1, '2025-01-15');
      expect(result).toHaveProperty('id', 10);
      expect(result.cafe_id).toBe(1);
      expect(result.date).toBe('2025-01-15');
      expect(result.total_orders).toBe(0);
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('fail'));
      await expect(CafeDailyMetrics.getOrCreate(1, '2025-01-15')).rejects.toThrow('Error getting or creating daily metrics');
    });
  });

  describe('incrementOrder', () => {
    it('increments total only when not completed', async () => {
      mockExecute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      await CafeDailyMetrics.incrementOrder(1, '2025-01-15', 10.5, false);
      expect(mockExecute).toHaveBeenNthCalledWith(3, expect.stringContaining('total_orders = total_orders + 1'), [10.5, 1]);
    });
    it('increments completed when isCompleted true', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      await CafeDailyMetrics.incrementOrder(1, '2025-01-15', 20, true);
      expect(mockExecute).toHaveBeenNthCalledWith(2, expect.stringContaining('completed_orders = completed_orders + 1'), [20, 20, 1]);
    });
    it('does not throw on error', async () => {
      mockExecute.mockResolvedValueOnce([[{ id: 1 }]]).mockRejectedValue(new Error('fail'));
      await expect(CafeDailyMetrics.incrementOrder(1, '2025-01-15', 0, false)).resolves.not.toThrow();
    });
  });

  describe('decrementOrder', () => {
    it('returns early when no existing metrics', async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      await CafeDailyMetrics.decrementOrder(1, '2025-01-15', 10, false);
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
    it('decrements when wasCompleted false', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      await CafeDailyMetrics.decrementOrder(1, '2025-01-15', 5, false);
      expect(mockExecute).toHaveBeenNthCalledWith(2, expect.stringContaining('GREATEST'), [5, 1]);
    });
    it('decrements completed when wasCompleted true', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      await CafeDailyMetrics.decrementOrder(1, '2025-01-15', 10, true);
      expect(mockExecute).toHaveBeenNthCalledWith(2, expect.stringContaining('completed_orders'), [10, 10, 1]);
    });
  });

  describe('updateOrderCompletion', () => {
    it('adds to completed when isNowCompleted true', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      await CafeDailyMetrics.updateOrderCompletion(1, '2025-01-15', 15, true);
      expect(mockExecute).toHaveBeenNthCalledWith(2, expect.stringContaining('completed_orders = completed_orders + 1'), [15, 1]);
    });
    it('removes from completed when isNowCompleted false', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      await CafeDailyMetrics.updateOrderCompletion(1, '2025-01-15', 15, false);
      expect(mockExecute).toHaveBeenNthCalledWith(2, expect.stringContaining('GREATEST(0, completed_orders - 1)'), [15, 1]);
    });
  });

  describe('incrementCustomer', () => {
    it('increments new_customers when isNew true', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      await CafeDailyMetrics.incrementCustomer(1, '2025-01-15', true);
      expect(mockExecute).toHaveBeenNthCalledWith(2, expect.stringContaining('new_customers = new_customers + 1'), [1]);
    });
    it('does not increment new_customers when isNew false', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      await CafeDailyMetrics.incrementCustomer(1, '2025-01-15', false);
      expect(mockExecute).toHaveBeenNthCalledWith(2, expect.stringContaining('new_customers = new_customers'), [1]);
    });
  });

  describe('getDateRange', () => {
    it('returns mapped rows', async () => {
      const row = { date: new Date('2025-01-15'), total_orders: 3, total_revenue: 50, completed_orders: 2, completed_revenue: 40, total_customers: 1, new_customers: 0 };
      mockExecute.mockResolvedValueOnce([[row]]);
      const result = await CafeDailyMetrics.getDateRange(1, '2025-01-01', '2025-01-31');
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2025-01-15');
      expect(result[0].total_revenue).toBe(50);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('fail'));
      await expect(CafeDailyMetrics.getDateRange(1, '2025-01-01', '2025-01-31')).rejects.toThrow('Error fetching date range metrics');
    });
  });

  describe('getTotals', () => {
    it('returns aggregated totals', async () => {
      mockExecute.mockResolvedValueOnce([[{ total_orders: 10, total_revenue: 100, completed_orders: 8, total_customers: 5 }]]);
      const result = await CafeDailyMetrics.getTotals(1);
      expect(result.total_orders).toBe(10);
      expect(result.total_revenue).toBe(100);
      expect(result.completed_orders).toBe(8);
      expect(result.total_customers).toBe(5);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('fail'));
      await expect(CafeDailyMetrics.getTotals(1)).rejects.toThrow('Error fetching totals');
    });
  });

  describe('getToday', () => {
    it('returns today metrics via getOrCreate', async () => {
      mockExecute.mockResolvedValueOnce([[{ id: 1, total_orders: 2, total_revenue: 25, completed_orders: 1, completed_revenue: 12 }]]);
      const result = await CafeDailyMetrics.getToday(1);
      expect(result.total_orders).toBe(2);
      expect(result.total_revenue).toBe(25);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('fail'));
      await expect(CafeDailyMetrics.getToday(1)).rejects.toThrow('Error fetching today metrics');
    });
  });

  describe('getThisMonth', () => {
    it('returns month aggregates', async () => {
      mockExecute.mockResolvedValueOnce([[{ total_orders: 50, total_revenue: 500 }]]);
      const result = await CafeDailyMetrics.getThisMonth(1);
      expect(result.total_orders).toBe(50);
      expect(result.total_revenue).toBe(500);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('fail'));
      await expect(CafeDailyMetrics.getThisMonth(1)).rejects.toThrow('Error fetching this month metrics');
    });
  });

  describe('recompute', () => {
    it('returns early when cafe_id not in orders', async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      await CafeDailyMetrics.recompute(1, '2025-01-15');
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
    it('updates metrics when orders and customers exist', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ total_orders: 5, total_revenue: 100, completed_orders: 4, completed_revenue: 80 }]])
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ total_customers: 3, new_customers: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      await CafeDailyMetrics.recompute(1, '2025-01-15');
      expect(mockExecute).toHaveBeenCalledTimes(5);
    });
    it('throws on DB error', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockRejectedValue(new Error('fail'));
      await expect(CafeDailyMetrics.recompute(1, '2025-01-15')).rejects.toThrow();
    });
  });
});
