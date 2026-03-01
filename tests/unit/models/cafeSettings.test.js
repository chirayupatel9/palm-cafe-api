/**
 * Unit tests for CafeSettings model. DB mocked.
 */
const mockExecute = jest.fn();
const mockGetConnection = jest.fn();
jest.mock('../../../config/database', () => ({
  pool: {
    execute: (...args) => mockExecute(...args),
    getConnection: () => mockGetConnection()
  }
}));
jest.mock('../../../config/logger', () => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const CafeSettings = require('../../../models/cafeSettings');

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

describe('CafeSettings model', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockGetConnection.mockReset();
  });

  describe('getDefaultSettings', () => {
    it('returns object with all expected keys', () => {
      const result = CafeSettings.getDefaultSettings();
      expect(result).toHaveProperty('cafe_name', null);
      expect(result).toHaveProperty('show_kitchen_tab', true);
      expect(result).toHaveProperty('color_scheme', 'default');
      expect(result).toHaveProperty('is_active', true);
      expect(result).toHaveProperty('created_at');
      expect(result).toHaveProperty('updated_at');
    });
  });

  describe('getCurrent', () => {
    it('returns default settings when table has no selectable columns', async () => {
      mockExecute.mockResolvedValueOnce([[
        { COLUMN_NAME: 'id' },
        { COLUMN_NAME: 'is_active' },
        { COLUMN_NAME: 'created_at' },
        { COLUMN_NAME: 'updated_at' }
      ]]);
      const result = await CafeSettings.getCurrent(1);
      expect(result).toHaveProperty('cafe_name', null);
      expect(result).toHaveProperty('show_kitchen_tab', true);
    });

    it('returns default when cafe_id column exists but no cafeId provided', async () => {
      mockExecute.mockResolvedValueOnce([[
        { COLUMN_NAME: 'cafe_id' },
        { COLUMN_NAME: 'cafe_name' },
        { COLUMN_NAME: 'is_active' },
        { COLUMN_NAME: 'created_at' },
        { COLUMN_NAME: 'updated_at' }
      ]]);
      const result = await CafeSettings.getCurrent(null);
      expect(result).toHaveProperty('cafe_name', null);
    });

    it('returns row when cafeId provided and row found', async () => {
      mockExecute
        .mockResolvedValueOnce([[
          { COLUMN_NAME: 'cafe_id' },
          { COLUMN_NAME: 'cafe_name' },
          { COLUMN_NAME: 'is_active' },
          { COLUMN_NAME: 'created_at' },
          { COLUMN_NAME: 'updated_at' }
        ]])
        .mockResolvedValueOnce([[{ cafe_id: 1, cafe_name: 'Test Cafe' }]]);
      const result = await CafeSettings.getCurrent(1);
      expect(result).toHaveProperty('cafe_name', 'Test Cafe');
      expect(result).toHaveProperty('cafe_id', 1);
    });

    it('returns default when cafe_id mismatch', async () => {
      mockExecute
        .mockResolvedValueOnce([[
          { COLUMN_NAME: 'cafe_id' },
          { COLUMN_NAME: 'cafe_name' },
          { COLUMN_NAME: 'is_active' },
          { COLUMN_NAME: 'created_at' },
          { COLUMN_NAME: 'updated_at' }
        ]])
        .mockResolvedValueOnce([[{ cafe_id: 99, cafe_name: 'Other' }]]);
      const result = await CafeSettings.getCurrent(1);
      expect(result).toHaveProperty('cafe_name', null);
    });

    it('returns default when no rows found', async () => {
      mockExecute
        .mockResolvedValueOnce([[
          { COLUMN_NAME: 'cafe_id' },
          { COLUMN_NAME: 'cafe_name' }
        ]])
        .mockResolvedValueOnce([[]]);
      const result = await CafeSettings.getCurrent(1);
      expect(result).toHaveProperty('cafe_name', null);
    });

    it('returns default on error', async () => {
      mockExecute.mockRejectedValueOnce(new Error('DB error'));
      const result = await CafeSettings.getCurrent(1);
      expect(result).toHaveProperty('cafe_name', null);
    });
  });

  describe('update', () => {
    it('updates existing record when hasCafeIdColumn and existing row found', async () => {
      const conn = mockConn();
      const baseCols = [
        { COLUMN_NAME: 'cafe_id' }, { COLUMN_NAME: 'cafe_name' }, { COLUMN_NAME: 'logo_url' },
        { COLUMN_NAME: 'address' }, { COLUMN_NAME: 'phone' }, { COLUMN_NAME: 'email' },
        { COLUMN_NAME: 'website' }, { COLUMN_NAME: 'opening_hours' }, { COLUMN_NAME: 'description' },
        { COLUMN_NAME: 'is_active' }, { COLUMN_NAME: 'created_at' }, { COLUMN_NAME: 'updated_at' }
      ];
      conn.execute
        .mockResolvedValueOnce([baseCols])
        .mockResolvedValueOnce([[{ id: 5 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_name' }, { COLUMN_NAME: 'changed_by' }, { COLUMN_NAME: 'changed_at' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockExecute.mockResolvedValue([[{ cafe_id: 1, cafe_name: 'Updated' }]]);
      const result = await CafeSettings.update({ cafe_name: 'My Cafe', cafe_id: 1 });
      expect(result).toHaveProperty('cafe_name', 'Updated');
      expect(conn.commit).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });

    it('inserts new record when no existing active settings', async () => {
      const conn = mockConn();
      const baseCols = [
        { COLUMN_NAME: 'cafe_id' }, { COLUMN_NAME: 'cafe_name' }, { COLUMN_NAME: 'logo_url' },
        { COLUMN_NAME: 'address' }, { COLUMN_NAME: 'phone' }, { COLUMN_NAME: 'email' },
        { COLUMN_NAME: 'website' }, { COLUMN_NAME: 'opening_hours' }, { COLUMN_NAME: 'description' },
        { COLUMN_NAME: 'is_active' }, { COLUMN_NAME: 'created_at' }, { COLUMN_NAME: 'updated_at' }
      ];
      conn.execute
        .mockResolvedValueOnce([baseCols])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_name' }, { COLUMN_NAME: 'changed_by' }, { COLUMN_NAME: 'changed_at' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockExecute.mockResolvedValue([[{ cafe_name: 'New Cafe', cafe_id: 1 }]]);
      const result = await CafeSettings.update({ cafe_name: 'New Cafe', cafe_id: 1 });
      expect(result.cafe_name).toBe('New Cafe');
      expect(conn.commit).toHaveBeenCalled();
    });

    it('legacy path: updates when no cafe_id column and existing row', async () => {
      const conn = mockConn();
      const baseCols = [
        { COLUMN_NAME: 'cafe_name' }, { COLUMN_NAME: 'logo_url' }, { COLUMN_NAME: 'address' },
        { COLUMN_NAME: 'phone' }, { COLUMN_NAME: 'email' }, { COLUMN_NAME: 'website' },
        { COLUMN_NAME: 'opening_hours' }, { COLUMN_NAME: 'description' },
        { COLUMN_NAME: 'is_active' }, { COLUMN_NAME: 'created_at' }, { COLUMN_NAME: 'updated_at' }
      ];
      conn.execute
        .mockResolvedValueOnce([baseCols])
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_name' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockExecute.mockResolvedValue([[{ cafe_name: 'Legacy' }]]);
      const result = await CafeSettings.update({ cafe_name: 'Legacy' });
      expect(result.cafe_name).toBe('Legacy');
    });

    it('rolls back and throws on error', async () => {
      const conn = mockConn();
      conn.execute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_name' }, { COLUMN_NAME: 'is_active' }, { COLUMN_NAME: 'created_at' }, { COLUMN_NAME: 'updated_at' }]]).mockRejectedValueOnce(new Error('fail'));
      await expect(CafeSettings.update({ cafe_name: 'X' })).rejects.toThrow('Error updating cafe settings');
      expect(conn.rollback).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('returns rows when history table exists', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ TABLE_NAME: 'cafe_settings_history' }]])
        .mockResolvedValueOnce([[{ id: 1, changed_at: new Date() }]]);
      const result = await CafeSettings.getHistory();
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id', 1);
    });

    it('returns empty when history table does not exist', async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      const result = await CafeSettings.getHistory();
      expect(result).toEqual([]);
    });

    it('returns empty on error', async () => {
      mockExecute.mockRejectedValueOnce(new Error('db'));
      const result = await CafeSettings.getHistory();
      expect(result).toEqual([]);
    });
  });

  describe('updateLogo', () => {
    it('returns updated settings', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }, { COLUMN_NAME: 'cafe_name' }, { COLUMN_NAME: 'logo_url' }, { COLUMN_NAME: 'is_active' }, { COLUMN_NAME: 'created_at' }, { COLUMN_NAME: 'updated_at' }]])
        .mockResolvedValueOnce([[{ cafe_id: 1, cafe_name: 'C', logo_url: null }]]);
      const conn = mockConn();
      conn.execute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }, { COLUMN_NAME: 'cafe_name' }, { COLUMN_NAME: 'logo_url' }, { COLUMN_NAME: 'address' }, { COLUMN_NAME: 'phone' }, { COLUMN_NAME: 'email' }, { COLUMN_NAME: 'website' }, { COLUMN_NAME: 'opening_hours' }, { COLUMN_NAME: 'description' }, { COLUMN_NAME: 'is_active' }, { COLUMN_NAME: 'created_at' }, { COLUMN_NAME: 'updated_at' }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_name' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }, { COLUMN_NAME: 'cafe_name' }, { COLUMN_NAME: 'logo_url' }, { COLUMN_NAME: 'is_active' }, { COLUMN_NAME: 'created_at' }, { COLUMN_NAME: 'updated_at' }]])
        .mockResolvedValueOnce([[{ cafe_id: 1, logo_url: 'https://logo.png' }]]);
      const result = await CafeSettings.updateLogo('https://logo.png', 1);
      expect(result).toHaveProperty('logo_url', 'https://logo.png');
    });

    it('throws on error', async () => {
      mockExecute.mockRejectedValue(new Error('db'));
      await expect(CafeSettings.updateLogo('url', 1)).rejects.toThrow('Error updating logo');
    });
  });

  describe('updateHeroImage', () => {
    it('returns updated settings', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }, { COLUMN_NAME: 'hero_image_url' }, { COLUMN_NAME: 'cafe_name' }, { COLUMN_NAME: 'is_active' }, { COLUMN_NAME: 'created_at' }, { COLUMN_NAME: 'updated_at' }]])
        .mockResolvedValueOnce([[{ cafe_id: 1, hero_image_url: null }]]);
      const conn = mockConn();
      conn.execute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }, { COLUMN_NAME: 'cafe_name' }, { COLUMN_NAME: 'logo_url' }, { COLUMN_NAME: 'address' }, { COLUMN_NAME: 'phone' }, { COLUMN_NAME: 'email' }, { COLUMN_NAME: 'website' }, { COLUMN_NAME: 'opening_hours' }, { COLUMN_NAME: 'description' }, { COLUMN_NAME: 'is_active' }, { COLUMN_NAME: 'created_at' }, { COLUMN_NAME: 'updated_at' }, { COLUMN_NAME: 'hero_image_url' }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_name' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }, { COLUMN_NAME: 'hero_image_url' }, { COLUMN_NAME: 'cafe_name' }, { COLUMN_NAME: 'is_active' }, { COLUMN_NAME: 'created_at' }, { COLUMN_NAME: 'updated_at' }]])
        .mockResolvedValueOnce([[{ cafe_id: 1, hero_image_url: 'https://hero.jpg' }]]);
      const result = await CafeSettings.updateHeroImage('https://hero.jpg', 1);
      expect(result).toHaveProperty('hero_image_url', 'https://hero.jpg');
    });

    it('throws on error', async () => {
      mockExecute.mockRejectedValue(new Error('db'));
      await expect(CafeSettings.updateHeroImage('url', 1)).rejects.toThrow('Error updating hero image');
    });
  });

  describe('updatePromoBannerImage', () => {
    it('returns updated settings', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }, { COLUMN_NAME: 'promo_banner_image_url' }, { COLUMN_NAME: 'cafe_name' }, { COLUMN_NAME: 'is_active' }, { COLUMN_NAME: 'created_at' }, { COLUMN_NAME: 'updated_at' }]])
        .mockResolvedValueOnce([[{ cafe_id: 1, promo_banner_image_url: null }]]);
      const conn = mockConn();
      conn.execute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }, { COLUMN_NAME: 'cafe_name' }, { COLUMN_NAME: 'logo_url' }, { COLUMN_NAME: 'address' }, { COLUMN_NAME: 'phone' }, { COLUMN_NAME: 'email' }, { COLUMN_NAME: 'website' }, { COLUMN_NAME: 'opening_hours' }, { COLUMN_NAME: 'description' }, { COLUMN_NAME: 'is_active' }, { COLUMN_NAME: 'created_at' }, { COLUMN_NAME: 'updated_at' }, { COLUMN_NAME: 'promo_banner_image_url' }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 0 }])
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_name' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }, { COLUMN_NAME: 'promo_banner_image_url' }, { COLUMN_NAME: 'cafe_name' }, { COLUMN_NAME: 'is_active' }, { COLUMN_NAME: 'created_at' }, { COLUMN_NAME: 'updated_at' }]])
        .mockResolvedValueOnce([[{ cafe_id: 1, promo_banner_image_url: 'https://promo.png' }]]);
      const result = await CafeSettings.updatePromoBannerImage('https://promo.png', 1);
      expect(result).toHaveProperty('promo_banner_image_url', 'https://promo.png');
    });

    it('throws on error', async () => {
      mockExecute.mockRejectedValue(new Error('db'));
      await expect(CafeSettings.updatePromoBannerImage('url', 1)).rejects.toThrow('Error updating promo banner image');
    });
  });
});
