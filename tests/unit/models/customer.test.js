/**
 * Unit tests for Customer model. DB mocked.
 */
const mockExecute = jest.fn();
jest.mock('../../../config/database', () => ({
  pool: { execute: (...args) => mockExecute(...args) }
}));

const Customer = require('../../../models/customer');

describe('Customer model', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  describe('getAll', () => {
    it('returns empty when cafe_id column exists but no cafeId', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]);
      const result = await Customer.getAll(null);
      expect(result).toEqual([]);
    });
    it('returns rows with parsed numbers when cafeId provided', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ id: 1, name: 'A', loyalty_points: 10, total_spent: 100, visit_count: 5 }]]);
      const result = await Customer.getAll(1);
      expect(result).toHaveLength(1);
      expect(result[0].loyalty_points).toBe(10);
      expect(result[0].total_spent).toBe(100);
    });
  });

  describe('getById', () => {
    it('returns null when not found', async () => {
      mockExecute.mockResolvedValue([[]]);
      const result = await Customer.getById(999, 1);
      expect(result).toBeNull();
    });
    it('returns customer when found', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, name: 'J', loyalty_points: 0, total_spent: 0, visit_count: 0 }]]);
      const result = await Customer.getById(1, 1);
      expect(result).toHaveProperty('name', 'J');
    });
  });

  describe('findByEmailOrPhone', () => {
    it('returns null when cafe_id exists but no cafeId', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]);
      const result = await Customer.findByEmailOrPhone(null, '555', null);
      expect(result).toBeNull();
    });
  });
});
