/**
 * Unit tests for Inventory model. DB mocked.
 */
const mockExecute = jest.fn();
jest.mock('../../../config/database', () => ({
  pool: { execute: (...args) => mockExecute(...args) }
}));

const Inventory = require('../../../models/inventory');

describe('Inventory model', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  describe('getAll', () => {
    it('returns items with parsed numbers when cafeId provided', async () => {
      mockExecute.mockResolvedValue([[
        { id: 1, name: 'Coffee', category: 'Beverages', quantity: 10, unit: 'kg', cost_per_unit: 5.5, reorder_level: 2 }
      ]]);
      const result = await Inventory.getAll(1);
      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(10);
      expect(result[0].cost_per_unit).toBe(5.5);
    });
    it('returns items without where when cafeId null', async () => {
      mockExecute.mockResolvedValue([[]]);
      const result = await Inventory.getAll(null);
      expect(result).toEqual([]);
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('FROM inventory'), []);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      await expect(Inventory.getAll(1)).rejects.toThrow('Error fetching inventory');
    });
  });

  describe('getById', () => {
    it('throws for invalid id (non-integer)', async () => {
      await expect(Inventory.getById('abc')).rejects.toThrow('Invalid inventory item ID');
    });
    it('throws for invalid id (zero)', async () => {
      await expect(Inventory.getById(0)).rejects.toThrow('Invalid inventory item ID');
    });
    it('returns null when not found', async () => {
      mockExecute.mockResolvedValue([[]]);
      const result = await Inventory.getById(999, 1);
      expect(result).toBeNull();
    });
    it('returns item with parsed numbers when found', async () => {
      mockExecute.mockResolvedValue([[{
        id: 1,
        name: 'Beans',
        category: 'Dry',
        quantity: 50,
        unit: 'kg',
        cost_per_unit: 10,
        reorder_level: 5
      }]]);
      const result = await Inventory.getById(1, 1);
      expect(result.quantity).toBe(50);
      expect(result.cost_per_unit).toBe(10);
    });
  });

  describe('create', () => {
    it('inserts with cafe_id when provided', async () => {
      mockExecute.mockResolvedValue([{ insertId: 5 }]);
      const data = { name: 'New', category: 'Cat', quantity: 0, unit: 'kg' };
      const result = await Inventory.create(data, 1);
      expect(result).toHaveProperty('id', 5);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('cafe_id'),
        expect.any(Array)
      );
    });
    it('inserts without cafe_id when null', async () => {
      mockExecute.mockResolvedValue([{ insertId: 5 }]);
      await Inventory.create({ name: 'N', category: 'C', quantity: 0, unit: 'u' }, null);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO inventory'),
        expect.arrayContaining(['N', 'C', 0, 'u'])
      );
    });
  });

  describe('update', () => {
    it('throws for invalid id', async () => {
      await expect(Inventory.update('x', { name: 'N', category: 'C', quantity: 0, unit: 'u' })).rejects.toThrow('Invalid inventory item ID');
    });
    it('executes update and returns getById', async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ id: 1, name: 'Updated', category: 'C', quantity: 5, unit: 'kg', cost_per_unit: null, reorder_level: null }]]);
      const result = await Inventory.update(1, { name: 'Updated', category: 'C', quantity: 5, unit: 'kg' });
      expect(result.name).toBe('Updated');
    });
  });
});
