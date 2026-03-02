/**
 * Unit tests for MenuItem model. DB mocked.
 */
const mockExecute = jest.fn();
const mockGetConnection = jest.fn();
jest.mock('../../../config/database', () => ({
  pool: {
    execute: (...args) => mockExecute(...args),
    getConnection: () => mockGetConnection()
  }
}));
jest.mock('../../../config/logger', () => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

const MenuItem = require('../../../models/menuItem');

describe('MenuItem model', () => {
  let originalHasCafeIdColumn;
  beforeEach(() => {
    mockExecute.mockReset();
    mockGetConnection.mockReset();
    if (originalHasCafeIdColumn) MenuItem.hasCafeIdColumn = originalHasCafeIdColumn;
  });
  beforeAll(() => {
    originalHasCafeIdColumn = MenuItem.hasCafeIdColumn;
  });

  describe('getAll', () => {
    it('throws when cafe_id column exists but no cafeId', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]);
      await expect(MenuItem.getAll(null)).rejects.toThrow('cafeId is required');
    });
    it('returns mapped rows when cafeId provided', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ id: 1, name: 'Coffee', price: 4.5, sort_order: 1, featured_priority: null }]]);
      const result = await MenuItem.getAll(1);
      expect(result).toHaveLength(1);
      expect(result[0].price).toBe(4.5);
      expect(result[0].sort_order).toBe(1);
    });
    it('returns empty array when no rows', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]).mockResolvedValueOnce([[]]);
      const result = await MenuItem.getAll(1);
      expect(result).toEqual([]);
    });
  });

  describe('getGroupedByCategory', () => {
    it('throws when cafe_id exists but no cafeId', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]).mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]);
      await expect(MenuItem.getGroupedByCategory(null)).rejects.toThrow('cafeId is required');
    });
    it('returns grouped array with items', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ category_id: 1, category_name: 'Drinks', category_description: '', category_sort_order: 0, id: 1, name: 'Tea', price: 3, sort_order: 1, image_url: null }]]);
      const result = await MenuItem.getGroupedByCategory(1);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Drinks');
      expect(result[0].items).toHaveLength(1);
      expect(result[0].items[0].name).toBe('Tea');
    });
    it('handles category row with no menu item (row.id null)', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ category_id: 1, category_name: 'Empty', category_description: '', category_sort_order: 0, id: null, name: null, price: null, sort_order: null, image_url: null }]]);
      const result = await MenuItem.getGroupedByCategory(1);
      expect(result[0].items).toEqual([]);
    });
  });

  describe('getById', () => {
    it('returns null when not found', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'featured_priority' }, { COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[]]);
      const result = await MenuItem.getById(999);
      expect(result).toBeNull();
    });
    it('returns item with parsed numbers', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'featured_priority' }, { COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ id: 1, name: 'Latte', price: 4.75, sort_order: 2, featured_priority: 1, category_id: 1 }]]);
      const result = await MenuItem.getById(1);
      expect(result.price).toBe(4.75);
      expect(result.featured_priority).toBe(1);
    });
    it('handles no featured_priority column', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ id: 1, name: 'X', price: 1, sort_order: 0 }]]);
      const result = await MenuItem.getById(1);
      expect(result.featured_priority).toBeNull();
    });
  });

  describe('create', () => {
    it('throws when category_id missing', async () => {
      await expect(MenuItem.create({ name: 'X', price: 1 })).rejects.toThrow('Category ID is required');
    });
    it('throws when cafe_id column exists but no cafe_id', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]);
      await expect(MenuItem.create({ category_id: 1, name: 'X', price: 1 })).rejects.toThrow('Cafe ID is required');
    });
    it('inserts and returns getById when hasCafeId', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([{ insertId: 10 }])
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'featured_priority' }, { COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ id: 10, name: 'New', price: 5, sort_order: 0, category_id: 1, description: '', is_available: 1, image_url: null, created_at: null, updated_at: null, category_name: 'Drinks' }]]);
      const result = await MenuItem.create({ category_id: 1, name: 'New', price: 5, cafe_id: 1 });
      expect(result).toHaveProperty('id', 10);
    });
  });

  describe('update', () => {
    it('throws when category_id missing', async () => {
      mockExecute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
      await expect(MenuItem.update(1, { name: 'X' })).rejects.toThrow('Category ID is required');
    });
    it('throws when menu item not found', async () => {
      mockExecute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 0 }]);
      await expect(MenuItem.update(999, { category_id: 1, name: 'X', price: 1 })).rejects.toThrow('Menu item not found');
    });
    it('updates and returns getById when affectedRows > 0', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'featured_priority' }]])
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'featured_priority' }, { COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ id: 1, name: 'Updated', price: 6, sort_order: 0, category_id: 1, description: '', is_available: 1, image_url: null, created_at: null, updated_at: null, category_name: 'Drinks' }]]);
      const result = await MenuItem.update(1, { category_id: 1, name: 'Updated', price: 6 });
      expect(result.name).toBe('Updated');
    });
  });

  describe('delete', () => {
    it('returns success when row deleted', async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
      const result = await MenuItem.delete(1);
      expect(result).toEqual({ success: true });
    });
    it('throws when no row matched', async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      await expect(MenuItem.delete(999)).rejects.toThrow('Menu item not found');
    });
    it('scopes by cafe_id when cafeId provided and column exists', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
      await MenuItem.delete(1, 5);
      expect(mockExecute).toHaveBeenLastCalledWith(expect.stringContaining('cafe_id'), [1, 5]);
    });
  });

  describe('getFeatured', () => {
    it('returns empty array when featured_priority column does not exist', async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      MenuItem.hasCafeIdColumn = jest.fn().mockResolvedValue(false);
      const result = await MenuItem.getFeatured(null);
      expect(result).toEqual([]);
    });
    it('returns featured items when column exists', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'featured_priority' }]])
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ id: 1, name: 'F', price: '5', sort_order: '0', featured_priority: '10', category_id: 1, description: '', is_available: 1, image_url: null, category_name: 'Drinks' }]]);
      const result = await MenuItem.getFeatured(1, 6);
      expect(result).toHaveLength(1);
      expect(result[0].featured_priority).toBe(10);
    });
  });

  describe('hasCafeIdColumn', () => {
    it('returns true when column exists', async () => {
      mockExecute.mockResolvedValue([[{ COLUMN_NAME: 'cafe_id' }]]);
      const result = await MenuItem.hasCafeIdColumn();
      expect(result).toBe(true);
    });
    it('returns false when column missing', async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      const result = await MenuItem.hasCafeIdColumn();
      expect(result).toBe(false);
    });
    it('returns false on error', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      const result = await MenuItem.hasCafeIdColumn();
      expect(result).toBe(false);
    });
  });

  describe('getByCategory', () => {
    it('returns items for category', async () => {
      mockExecute.mockResolvedValueOnce([[{ id: 1, name: 'Espresso', price: 3.5, sort_order: 1 }]]);
      const result = await MenuItem.getByCategory(1);
      expect(result).toHaveLength(1);
      expect(result[0].price).toBe(3.5);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('DB fail'));
      await expect(MenuItem.getByCategory(1)).rejects.toThrow('Error fetching menu items by category');
    });
  });
});
