/**
 * Unit tests for PaymentMethod model. DB mocked.
 */
const mockExecute = jest.fn();
const mockGetConnection = jest.fn();
jest.mock('../../../config/database', () => ({
  pool: {
    execute: (...args) => mockExecute(...args),
    getConnection: () => mockGetConnection()
  }
}));

const PaymentMethod = require('../../../models/paymentMethod');

const cafeIdCol = [{ COLUMN_NAME: 'cafe_id' }];
const noCols = [];

describe('PaymentMethod model', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockGetConnection.mockReset();
  });

  describe('getAll', () => {
    it('returns rows when cafe_id column exists and cafeId provided', async () => {
      mockExecute
        .mockResolvedValueOnce([cafeIdCol])
        .mockResolvedValueOnce([[{ id: 1, name: 'Cash', code: 'cash', is_active: true }]]);
      const result = await PaymentMethod.getAll(1);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Cash');
      expect(mockExecute).toHaveBeenNthCalledWith(2, expect.stringContaining('AND cafe_id = ?'), [1]);
    });
    it('returns empty when cafe_id exists but cafeId not provided', async () => {
      mockExecute.mockResolvedValueOnce([cafeIdCol]);
      const result = await PaymentMethod.getAll(null);
      expect(result).toEqual([]);
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
    it('returns rows when no cafe_id column', async () => {
      mockExecute
        .mockResolvedValueOnce([noCols])
        .mockResolvedValueOnce([[{ id: 1, name: 'Cash' }]]);
      const result = await PaymentMethod.getAll(null);
      expect(result).toHaveLength(1);
    });
    it('throws on DB error', async () => {
      mockExecute.mockResolvedValueOnce([cafeIdCol]).mockRejectedValue(new Error('fail'));
      await expect(PaymentMethod.getAll(1)).rejects.toThrow('Error fetching payment methods');
    });
  });

  describe('getAllForAdmin', () => {
    it('returns rows with cafeId filter when cafe_id column exists', async () => {
      mockExecute
        .mockResolvedValueOnce([cafeIdCol])
        .mockResolvedValueOnce([[{ id: 1, is_active: false }]]);
      const result = await PaymentMethod.getAllForAdmin(1);
      expect(result).toHaveLength(1);
      expect(mockExecute).toHaveBeenNthCalledWith(2, expect.stringContaining('AND cafe_id = ?'), [1]);
    });
    it('returns empty when cafe_id exists but cafeId null', async () => {
      mockExecute.mockResolvedValueOnce([cafeIdCol]);
      const result = await PaymentMethod.getAllForAdmin(null);
      expect(result).toEqual([]);
    });
    it('throws on DB error', async () => {
      mockExecute.mockResolvedValueOnce([cafeIdCol]).mockRejectedValue(new Error('fail'));
      await expect(PaymentMethod.getAllForAdmin(1)).rejects.toThrow('Error fetching payment methods');
    });
  });

  describe('getById', () => {
    it('returns row when found', async () => {
      mockExecute
        .mockResolvedValueOnce([cafeIdCol])
        .mockResolvedValueOnce([[{ id: 1, name: 'Cash', code: 'cash' }]]);
      const result = await PaymentMethod.getById(1, 2);
      expect(result).toHaveProperty('name', 'Cash');
      expect(mockExecute).toHaveBeenNthCalledWith(2, expect.any(String), [1, 2]);
    });
    it('returns null when not found', async () => {
      mockExecute
        .mockResolvedValueOnce([cafeIdCol])
        .mockResolvedValueOnce([[]]);
      const result = await PaymentMethod.getById(999);
      expect(result).toBeNull();
    });
    it('throws on DB error', async () => {
      mockExecute.mockResolvedValueOnce([cafeIdCol]).mockRejectedValue(new Error('fail'));
      await expect(PaymentMethod.getById(1)).rejects.toThrow('Error fetching payment method');
    });
  });

  describe('getByCode', () => {
    it('returns row when found and active', async () => {
      mockExecute
        .mockResolvedValueOnce([cafeIdCol])
        .mockResolvedValueOnce([[{ id: 1, code: 'upi' }]]);
      const result = await PaymentMethod.getByCode('upi', 1);
      expect(result).toHaveProperty('code', 'upi');
    });
    it('returns null when not found', async () => {
      mockExecute
        .mockResolvedValueOnce([cafeIdCol])
        .mockResolvedValueOnce([[]]);
      const result = await PaymentMethod.getByCode('unknown');
      expect(result).toBeNull();
    });
    it('throws on DB error', async () => {
      mockExecute.mockResolvedValueOnce([cafeIdCol]).mockRejectedValue(new Error('fail'));
      await expect(PaymentMethod.getByCode('cash')).rejects.toThrow('Error fetching payment method');
    });
  });

  describe('create', () => {
    it('throws when code already exists for cafe', async () => {
      mockExecute.mockResolvedValueOnce([cafeIdCol]);
      PaymentMethod.getByCode = jest.fn().mockResolvedValue({ id: 1, code: 'cash' });
      await expect(
        PaymentMethod.create({ name: 'X', code: 'cash', cafe_id: 1 })
      ).rejects.toThrow('Payment method code already exists for this cafe');
    });
    it('inserts with cafe_id when column exists', async () => {
      mockExecute
        .mockResolvedValueOnce([cafeIdCol])
        .mockResolvedValueOnce([{ insertId: 10 }])
        .mockResolvedValueOnce([cafeIdCol])
        .mockResolvedValueOnce([[{ id: 10, name: 'Card', code: 'card' }]]);
      PaymentMethod.getByCode = jest.fn().mockResolvedValue(null);
      const result = await PaymentMethod.create({ name: 'Card', code: 'card', cafe_id: 1 });
      expect(result.id).toBe(10);
      expect(mockExecute).toHaveBeenNthCalledWith(2, expect.stringContaining('cafe_id'), expect.arrayContaining([1]));
    });
    it('throws on DB error', async () => {
      mockExecute.mockResolvedValueOnce([cafeIdCol]);
      PaymentMethod.getByCode = jest.fn().mockResolvedValue(null);
      mockExecute.mockResolvedValueOnce([{ insertId: 1 }]).mockRejectedValue(new Error('fail'));
      await expect(PaymentMethod.create({ name: 'X', code: 'x' })).rejects.toThrow('Error creating payment method');
    });
  });

  describe('update', () => {
    it('throws when payment method not found', async () => {
      mockExecute
        .mockResolvedValueOnce([cafeIdCol])
        .mockResolvedValueOnce([{ affectedRows: 0 }]);
      PaymentMethod.getByCode = jest.fn().mockResolvedValue(null);
      await expect(
        PaymentMethod.update(99, 1, { name: 'X', code: 'x', description: null, icon: null, display_order: 0, is_active: true })
      ).rejects.toThrow('Payment method not found');
    });
    it('returns updated row when affectedRows > 0', async () => {
      mockExecute
        .mockResolvedValueOnce([cafeIdCol])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([cafeIdCol])
        .mockResolvedValueOnce([[{ id: 1, name: 'Updated' }]]);
      PaymentMethod.getByCode = jest.fn().mockResolvedValue(null);
      const result = await PaymentMethod.update(1, 1, { name: 'Updated', code: 'cash', description: null, icon: null, display_order: 0, is_active: true });
      expect(result.name).toBe('Updated');
    });
  });

  describe('delete', () => {
    it('returns success when deleted', async () => {
      mockExecute
        .mockResolvedValueOnce([cafeIdCol])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      const result = await PaymentMethod.delete(1, 1);
      expect(result).toEqual({ success: true, message: 'Payment method deleted successfully' });
    });
    it('throws when not found', async () => {
      mockExecute
        .mockResolvedValueOnce([cafeIdCol])
        .mockResolvedValueOnce([{ affectedRows: 0 }]);
      await expect(PaymentMethod.delete(999, 1)).rejects.toThrow('Payment method not found');
    });
  });

  describe('toggleStatus', () => {
    it('throws when payment method not found', async () => {
      mockExecute.mockResolvedValueOnce([cafeIdCol]);
      PaymentMethod.getById = jest.fn().mockResolvedValue(null);
      await expect(PaymentMethod.toggleStatus(999, 1)).rejects.toThrow('Payment method not found');
    });
    it('returns updated row with flipped is_active', async () => {
      mockExecute
        .mockResolvedValueOnce([cafeIdCol])
        .mockResolvedValueOnce([cafeIdCol])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ id: 1, is_active: false }]]);
      PaymentMethod.getById = jest.fn()
        .mockResolvedValueOnce({ id: 1, is_active: true })
        .mockResolvedValueOnce({ id: 1, is_active: false });
      const result = await PaymentMethod.toggleStatus(1, 1);
      expect(result.is_active).toBe(false);
    });
  });

  describe('reorder', () => {
    it('returns success when reorder succeeds', async () => {
      const conn = {
        execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn(),
        release: jest.fn()
      };
      mockGetConnection.mockResolvedValue(conn);
      mockExecute.mockResolvedValueOnce([cafeIdCol]);
      const result = await PaymentMethod.reorder(1, [3, 1, 2]);
      expect(result).toEqual({ success: true, message: 'Payment methods reordered successfully' });
      expect(conn.commit).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });
    it('throws on error', async () => {
      mockExecute.mockResolvedValueOnce([cafeIdCol]);
      mockGetConnection.mockRejectedValue(new Error('no conn'));
      await expect(PaymentMethod.reorder(1, [1, 2])).rejects.toThrow('Error reordering payment methods');
    });
  });

  describe('getDefaults', () => {
    it('returns array of default payment methods', async () => {
      const result = await PaymentMethod.getDefaults();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0]).toHaveProperty('name', 'Cash');
      expect(result[0]).toHaveProperty('code', 'cash');
      expect(result[1]).toHaveProperty('code', 'upi');
    });
  });

  describe('initializeDefaults', () => {
    it('does not throw when getAll returns non-empty (skips creating)', async () => {
      mockExecute.mockResolvedValueOnce([noCols]).mockResolvedValueOnce([[{ id: 1 }]]);
      await expect(PaymentMethod.initializeDefaults()).resolves.not.toThrow();
    });
    it('does not throw when getAll returns empty and create fails', async () => {
      mockExecute
        .mockResolvedValueOnce([noCols])
        .mockResolvedValueOnce([[]]);
      PaymentMethod.create = jest.fn().mockRejectedValue(new Error('create fail'));
      await expect(PaymentMethod.initializeDefaults()).resolves.not.toThrow();
    });
  });
});
