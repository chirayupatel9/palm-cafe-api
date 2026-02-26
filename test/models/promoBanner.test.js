/**
 * Unit tests for PromoBanner model (promo-banners API backend).
 * Database pool is mocked; no real DB required.
 */

const mockExecute = jest.fn();
jest.mock('../../config/database', () => ({
  pool: { execute: (...args) => mockExecute(...args) }
}));

const PromoBanner = require('../../models/promoBanner');

describe('PromoBanner model', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  describe('getByCafeId', () => {
    it('returns banners ordered by priority then id, with active as boolean', async () => {
      const rows = [
        { id: 1, cafe_id: 10, image_url: '/img/1.jpg', link_url: 'https://a.com', priority: 0, active: 1, created_at: new Date() },
        { id: 2, cafe_id: 10, image_url: '/img/2.jpg', link_url: null, priority: 1, active: 0, created_at: new Date() }
      ];
      mockExecute.mockResolvedValue([rows]);

      const result = await PromoBanner.getByCafeId(10);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY priority ASC, id ASC'),
        [10]
      );
      expect(result).toHaveLength(2);
      expect(result[0].active).toBe(true);
      expect(result[1].active).toBe(false);
    });

    it('returns empty array when no banners', async () => {
      mockExecute.mockResolvedValue([[]]);
      const result = await PromoBanner.getByCafeId(99);
      expect(result).toEqual([]);
    });
  });

  describe('getActiveByCafeId', () => {
    it('returns only active banners with normalized shape', async () => {
      const rows = [
        { id: 1, image_url: '/img/1.jpg', link_url: 'https://a.com', priority: 0, active: 1 }
      ];
      mockExecute.mockResolvedValue([rows]);

      const result = await PromoBanner.getActiveByCafeId(10);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('active = 1'),
        [10]
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 1,
        image_url: '/img/1.jpg',
        link_url: 'https://a.com',
        priority: 0,
        active: true
      });
    });

    it('normalizes null link_url', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, image_url: '/x', link_url: null, priority: 0, active: 1 }]]);
      const result = await PromoBanner.getActiveByCafeId(10);
      expect(result[0].link_url).toBeNull();
    });
  });

  describe('getByIdAndCafe', () => {
    it('returns banner when found', async () => {
      const row = { id: 5, cafe_id: 10, image_url: '/img/5.jpg', link_url: null, priority: 0, active: 1, created_at: new Date() };
      mockExecute.mockResolvedValue([[row]]);

      const result = await PromoBanner.getByIdAndCafe(5, 10);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('id = ? AND cafe_id = ?'),
        [5, 10]
      );
      expect(result).not.toBeNull();
      expect(result.active).toBe(true);
    });

    it('returns null when not found', async () => {
      mockExecute.mockResolvedValue([[]]);
      const result = await PromoBanner.getByIdAndCafe(999, 10);
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('inserts banner and returns created row', async () => {
      mockExecute
        .mockResolvedValueOnce([{ insertId: 42 }])
        .mockResolvedValueOnce([[{
          id: 42,
          cafe_id: 10,
          image_url: '/images/promo.jpg',
          link_url: 'https://x.com',
          priority: 1,
          active: 1,
          created_at: new Date()
        }]]);

      const result = await PromoBanner.create({
        cafe_id: 10,
        image_url: '/images/promo.jpg',
        link_url: 'https://x.com',
        priority: 1,
        active: true
      });

      expect(mockExecute).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('INSERT INTO promo_banners'),
        [10, '/images/promo.jpg', 'https://x.com', 1, 1]
      );
      expect(result.id).toBe(42);
      expect(result.cafe_id).toBe(10);
    });

    it('defaults link_url to null, priority to 0, active to true', async () => {
      mockExecute.mockResolvedValueOnce([{ insertId: 1 }]).mockResolvedValueOnce([[{
        id: 1, cafe_id: 10, image_url: '/x', link_url: null, priority: 0, active: 1, created_at: new Date()
      }]]);

      await PromoBanner.create({ cafe_id: 10, image_url: '/x' });

      expect(mockExecute).toHaveBeenNthCalledWith(1, expect.any(String), [10, '/x', null, 0, 1]);
    });

    it('trims link_url and treats empty string as null', async () => {
      mockExecute.mockResolvedValueOnce([{ insertId: 1 }]).mockResolvedValueOnce([[{
        id: 1, cafe_id: 10, image_url: '/x', link_url: null, priority: 0, active: 1, created_at: new Date()
      }]]);

      await PromoBanner.create({ cafe_id: 10, image_url: '/x', link_url: '  ' });

      expect(mockExecute).toHaveBeenNthCalledWith(1, expect.any(String), [10, '/x', null, 0, 1]);
    });
  });

  describe('update', () => {
    it('returns null when banner does not exist', async () => {
      mockExecute.mockResolvedValueOnce([[]]);

      const result = await PromoBanner.update(99, 10, { link_url: 'https://new.com' });

      expect(result).toBeNull();
    });

    it('updates only provided fields and returns updated row', async () => {
      const existing = {
        id: 3,
        cafe_id: 10,
        image_url: '/old.jpg',
        link_url: 'https://old.com',
        priority: 0,
        active: 1,
        created_at: new Date()
      };
      mockExecute
        .mockResolvedValueOnce([[existing]])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([[{ ...existing, link_url: 'https://new.com', priority: 1 }]]);

      const result = await PromoBanner.update(3, 10, { link_url: 'https://new.com', priority: 1 });

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE promo_banners SET'),
        ['/old.jpg', 'https://new.com', 1, 1, 3, 10]
      );
      expect(result).not.toBeNull();
    });
  });

  describe('delete', () => {
    it('returns true when a row is deleted', async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await PromoBanner.delete(5, 10);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM promo_banners'),
        [5, 10]
      );
      expect(result).toBe(true);
    });

    it('returns false when no row matched', async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 0 }]);

      const result = await PromoBanner.delete(999, 10);

      expect(result).toBe(false);
    });
  });
});
