/**
 * Unit tests for Feature model. DB mocked.
 */
const mockExecute = jest.fn();
jest.mock('../../../config/database', () => ({
  pool: { execute: (...args) => mockExecute(...args) }
}));

const Feature = require('../../../models/feature');

describe('Feature model', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  describe('getAll', () => {
    it('returns features with boolean default_free and default_pro', async () => {
      mockExecute.mockResolvedValue([[
        { key: 'orders', name: 'Orders', default_free: 1, default_pro: 1 },
        { key: 'inventory', name: 'Inventory', default_free: 0, default_pro: 1 }
      ]]);
      const result = await Feature.getAll();
      expect(result).toHaveLength(2);
      expect(result[0].default_free).toBe(true);
      expect(result[0].default_pro).toBe(true);
      expect(result[1].default_free).toBe(false);
      expect(result[1].default_pro).toBe(true);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      await expect(Feature.getAll()).rejects.toThrow('Error fetching features');
    });
  });

  describe('getByKey', () => {
    it('returns feature when found', async () => {
      mockExecute.mockResolvedValue([[{ key: 'orders', name: 'Orders', default_free: 1, default_pro: 1 }]]);
      const result = await Feature.getByKey('orders');
      expect(result).toHaveProperty('key', 'orders');
      expect(result.default_free).toBe(true);
    });
    it('returns null when not found', async () => {
      mockExecute.mockResolvedValue([[]]);
      const result = await Feature.getByKey('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('throws when key missing', async () => {
      await expect(Feature.create({ name: 'X' })).rejects.toThrow('Key and name are required');
    });
    it('throws when name missing', async () => {
      await expect(Feature.create({ key: 'x' })).rejects.toThrow('Key and name are required');
    });
    it('inserts and returns feature', async () => {
      mockExecute
        .mockResolvedValueOnce([{ insertId: 1 }])
        .mockResolvedValueOnce([[{ key: 'new_feat', name: 'New', default_free: 0, default_pro: 1 }]]);
      const result = await Feature.create({ key: 'new_feat', name: 'New', default_free: false });
      expect(result).toHaveProperty('key', 'new_feat');
    });
    it('throws on duplicate key', async () => {
      mockExecute.mockRejectedValue({ code: 'ER_DUP_ENTRY' });
      await expect(Feature.create({ key: 'x', name: 'X' })).rejects.toThrow('already exists');
    });
  });

  describe('update', () => {
    it('returns getByKey when no fields to update', async () => {
      mockExecute.mockResolvedValue([[{ key: 'x', name: 'X', default_free: 0, default_pro: 1 }]]);
      const result = await Feature.update('x', {});
      expect(result).toHaveProperty('key', 'x');
    });
    it('throws when feature not found', async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      await expect(Feature.update('x', { name: 'Y' })).rejects.toThrow('Feature not found');
    });
  });

  describe('getCafeOverride', () => {
    it('returns row when found', async () => {
      mockExecute.mockResolvedValue([[{ cafe_id: 1, feature_key: 'orders', enabled: 1 }]]);
      const result = await Feature.getCafeOverride(1, 'orders');
      expect(result).toHaveProperty('feature_key', 'orders');
    });
    it('returns null when not found', async () => {
      mockExecute.mockResolvedValue([[]]);
      const result = await Feature.getCafeOverride(1, 'x');
      expect(result).toBeNull();
    });
  });

  describe('getCafeOverrides', () => {
    it('returns map of feature_key to boolean', async () => {
      mockExecute.mockResolvedValue([[
        { feature_key: 'orders', enabled: 1 },
        { feature_key: 'inventory', enabled: 0 }
      ]]);
      const result = await Feature.getCafeOverrides(1);
      expect(result.orders).toBe(true);
      expect(result.inventory).toBe(false);
    });
    it('returns empty object when no overrides', async () => {
      mockExecute.mockResolvedValue([[]]);
      const result = await Feature.getCafeOverrides(1);
      expect(result).toEqual({});
    });
  });

  describe('setCafeOverride', () => {
    it('executes insert and returns getCafeOverride', async () => {
      mockExecute
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([[{ cafe_id: 1, feature_key: 'orders', enabled: 1 }]]);
      const result = await Feature.setCafeOverride(1, 'orders', true);
      expect(result).toHaveProperty('enabled', 1);
    });
  });

  describe('removeCafeOverride', () => {
    it('returns success true when row deleted', async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
      const result = await Feature.removeCafeOverride(1, 'orders');
      expect(result).toEqual({ success: true });
    });
    it('returns success false when no row', async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 0 }]);
      const result = await Feature.removeCafeOverride(1, 'x');
      expect(result).toEqual({ success: false });
    });
  });
});
