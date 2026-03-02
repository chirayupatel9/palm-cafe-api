/**
 * Unit tests for Category model. DB mocked.
 */
const mockExecute = jest.fn();
jest.mock('../../../config/database', () => ({
  pool: { execute: (...args) => mockExecute(...args) }
}));

const Category = require('../../../models/category');

describe('Category model', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  describe('getAll', () => {
    it('returns categories when cafe_id column exists and cafeId provided', async () => {
      mockExecute.mockResolvedValue([[
        { id: 1, name: 'Beverages', description: '', sort_order: 0, is_active: true }
      ]]);
      const result = await Category.getAll(1);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Beverages');
      expect(result[0].sort_order).toBe(0);
    });
    it('returns empty array when cafe_id exists but no cafeId', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]);
      const result = await Category.getAll(null);
      expect(result).toEqual([]);
    });
  });

  describe('getById', () => {
    it('returns category when found', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, name: 'B', description: '', sort_order: 1, is_active: true }]]);
      const result = await Category.getById(1);
      expect(result).toHaveProperty('name', 'B');
    });
    it('returns null when not found', async () => {
      mockExecute.mockResolvedValue([[]]);
      const result = await Category.getById(999);
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('throws when cafe_id required but not provided', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]);
      await expect(Category.create({ name: 'X', cafe_id: null })).rejects.toThrow('cafe_id is required');
    });
    it('inserts and returns category when cafe_id provided', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([{ insertId: 10 }]);
      const result = await Category.create({ name: 'New', description: 'D', sort_order: 0, cafe_id: 1 });
      expect(result).toHaveProperty('id', 10);
      expect(result).toHaveProperty('name', 'New');
    });
  });

  describe('update', () => {
    it('throws when category not found', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[]]);
      await expect(Category.update(999, { name: 'X', description: '', sort_order: 0, is_active: true }, 1)).rejects.toThrow('Category not found');
    });
    it('throws when category does not belong to cafe', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ cafe_id: 2 }]])
        .mockResolvedValueOnce([]);
      await expect(Category.update(1, { name: 'X', description: '', sort_order: 0, is_active: true }, 1)).rejects.toThrow('does not belong');
    });
    it('updates and returns getById when successful', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ cafe_id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ id: 1, name: 'Updated', description: '', sort_order: 0, is_active: true }]]);
      const result = await Category.update(1, { name: 'Updated', description: '', sort_order: 0, is_active: true }, 1);
      expect(result.name).toBe('Updated');
    });
  });

  describe('delete', () => {
    it('throws when category not found (no existing row)', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[]]);
      await expect(Category.delete(999, 1)).rejects.toThrow('Category not found');
    });
    it('throws when update affects zero rows', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ cafe_id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 0 }]);
      await expect(Category.delete(999, 1)).rejects.toThrow('Category not found');
    });
  });
});
