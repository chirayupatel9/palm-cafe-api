/**
 * Unit tests for Cafe model. DB mocked.
 */
const mockExecute = jest.fn();
jest.mock('../../../config/database', () => ({
  pool: { execute: (...args) => mockExecute(...args) }
}));

const Cafe = require('../../../models/cafe');

describe('Cafe model', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  describe('hasOnboardingColumns', () => {
    it('returns true when both columns exist', async () => {
      mockExecute.mockResolvedValue([[{ COLUMN_NAME: 'is_onboarded' }, { COLUMN_NAME: 'onboarding_data' }]]);
      const result = await Cafe.hasOnboardingColumns();
      expect(result).toBe(true);
    });
    it('returns false when fewer columns', async () => {
      mockExecute.mockResolvedValue([[{ COLUMN_NAME: 'is_onboarded' }]]);
      const result = await Cafe.hasOnboardingColumns();
      expect(result).toBe(false);
    });
    it('returns false on error', async () => {
      mockExecute.mockRejectedValue(new Error('fail'));
      const result = await Cafe.hasOnboardingColumns();
      expect(result).toBe(false);
    });
  });

  describe('create', () => {
    it('throws when slug missing', async () => {
      await expect(Cafe.create({ name: 'Cafe' })).rejects.toThrow('Slug and name are required');
    });
    it('throws when name missing', async () => {
      await expect(Cafe.create({ slug: 'cafe' })).rejects.toThrow('Slug and name are required');
    });
    it('throws when slug has invalid chars', async () => {
      await expect(Cafe.create({ slug: 'Cafe_1', name: 'C' })).rejects.toThrow('lowercase');
    });
    it('inserts and returns getById result', async () => {
      mockExecute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 10 }])
        .mockResolvedValueOnce([[{ id: 10, slug: 'my-cafe', name: 'My Cafe', is_active: 1 }]]);
      const result = await Cafe.create({ slug: 'my-cafe', name: 'My Cafe' });
      expect(result).toHaveProperty('id', 10);
      expect(result).toHaveProperty('name', 'My Cafe');
    });
    it('throws on duplicate slug', async () => {
      mockExecute.mockResolvedValueOnce([[]]).mockRejectedValue({ code: 'ER_DUP_ENTRY' });
      await expect(Cafe.create({ slug: 'dup', name: 'D' })).rejects.toThrow('already exists');
    });
  });

  describe('getById', () => {
    it('returns null when not found', async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      const result = await Cafe.getById(999);
      expect(result).toBeNull();
    });
    it('parses enabled_modules JSON', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ id: 1, name: 'C', enabled_modules: '["orders"]', is_active: 1 }]])
        .mockResolvedValueOnce([[]]);
      const result = await Cafe.getById(1);
      expect(result.enabled_modules).toEqual(['orders']);
    });
    it('sets enabled_modules null on parse error', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ id: 1, name: 'C', enabled_modules: 'invalid', is_active: 1 }]])
        .mockResolvedValueOnce([[]]);
      const result = await Cafe.getById(1);
      expect(result.enabled_modules).toBeNull();
    });
  });

  describe('getBySlug', () => {
    it('returns null when not found', async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      const result = await Cafe.getBySlug('nonexistent');
      expect(result).toBeNull();
    });
    it('returns cafe when found', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ id: 1, slug: 'default', name: 'Default Cafe', is_active: 1 }]])
        .mockResolvedValueOnce([[]]);
      const result = await Cafe.getBySlug('default');
      expect(result).toHaveProperty('name', 'Default Cafe');
    });
  });

  describe('getAll', () => {
    it('returns rows with parsed enabled_modules', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, name: 'C', enabled_modules: '[]' }]]);
      const result = await Cafe.getAll();
      expect(result).toHaveLength(1);
      expect(result[0].enabled_modules).toEqual([]);
    });
  });

  describe('getFirstActive', () => {
    it('returns first active cafe', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, slug: 'first', name: 'First' }]]);
      const result = await Cafe.getFirstActive();
      expect(result).toHaveProperty('id', 1);
    });
    it('returns null when none', async () => {
      mockExecute.mockResolvedValue([[]]);
      const result = await Cafe.getFirstActive();
      expect(result).toBeNull();
    });
  });

  describe('slugExists', () => {
    it('returns true when slug found', async () => {
      mockExecute.mockResolvedValue([[{ count: 1 }]]);
      const result = await Cafe.slugExists('taken');
      expect(result).toBe(true);
    });
    it('returns false when slug not found', async () => {
      mockExecute.mockResolvedValue([[{ count: 0 }]]);
      const result = await Cafe.slugExists('free');
      expect(result).toBe(false);
    });
  });
});
