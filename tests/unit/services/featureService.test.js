/**
 * Unit tests for featureService. Cafe and Feature models mocked.
 */
jest.mock('../../../models/cafe');
jest.mock('../../../models/feature');

const Cafe = require('../../../models/cafe');
const Feature = require('../../../models/feature');
const featureService = require('../../../services/featureService');

describe('featureService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveCafeFeatures', () => {
    it('throws when cafe not found', async () => {
      Cafe.getById.mockResolvedValue(null);
      await expect(featureService.resolveCafeFeatures(999)).rejects.toThrow('Cafe not found');
    });
    it('returns all false when subscription status not active', async () => {
      Cafe.getById.mockResolvedValue({ id: 1, subscription_plan: 'FREE', subscription_status: 'inactive' });
      Feature.getAll.mockResolvedValue([{ key: 'orders', default_free: true, default_pro: true }]);
      const result = await featureService.resolveCafeFeatures(1);
      expect(result.orders).toBe(false);
    });
    it('returns plan defaults when no overrides', async () => {
      Cafe.getById.mockResolvedValue({ id: 1, subscription_plan: 'PRO', subscription_status: 'active' });
      Feature.getAll.mockResolvedValue([
        { key: 'orders', default_free: true, default_pro: true },
        { key: 'inventory', default_free: false, default_pro: true }
      ]);
      Feature.getCafeOverrides.mockResolvedValue({});
      const result = await featureService.resolveCafeFeatures(1);
      expect(result.orders).toBe(true);
      expect(result.inventory).toBe(true);
    });
    it('uses FREE defaults when plan is not PRO', async () => {
      Cafe.getById.mockResolvedValue({ id: 1, subscription_plan: 'FREE', subscription_status: 'active' });
      Feature.getAll.mockResolvedValue([{ key: 'inventory', default_free: false, default_pro: true }]);
      Feature.getCafeOverrides.mockResolvedValue({});
      const result = await featureService.resolveCafeFeatures(1);
      expect(result.inventory).toBe(false);
    });
    it('override takes precedence over plan default', async () => {
      Cafe.getById.mockResolvedValue({ id: 1, subscription_plan: 'FREE', subscription_status: 'active' });
      Feature.getAll.mockResolvedValue([{ key: 'inventory', default_free: false, default_pro: true }]);
      Feature.getCafeOverrides.mockResolvedValue({ inventory: true });
      const result = await featureService.resolveCafeFeatures(1);
      expect(result.inventory).toBe(true);
    });
    it('throws on error', async () => {
      Cafe.getById.mockRejectedValue(new Error('DB fail'));
      await expect(featureService.resolveCafeFeatures(1)).rejects.toThrow('Error resolving cafe features');
    });
  });

  describe('cafeHasFeature', () => {
    it('returns true when feature enabled', async () => {
      Cafe.getById.mockResolvedValue({ id: 1, subscription_plan: 'PRO', subscription_status: 'active' });
      Feature.getAll.mockResolvedValue([{ key: 'orders', default_free: true, default_pro: true }]);
      Feature.getCafeOverrides.mockResolvedValue({});
      const result = await featureService.cafeHasFeature(1, 'orders');
      expect(result).toBe(true);
    });
    it('returns false when feature disabled', async () => {
      Cafe.getById.mockResolvedValue({ id: 1, subscription_plan: 'FREE', subscription_status: 'active' });
      Feature.getAll.mockResolvedValue([{ key: 'inventory', default_free: false, default_pro: true }]);
      Feature.getCafeOverrides.mockResolvedValue({});
      const result = await featureService.cafeHasFeature(1, 'inventory');
      expect(result).toBe(false);
    });
    it('returns false on error', async () => {
      Cafe.getById.mockRejectedValue(new Error('fail'));
      const result = await featureService.cafeHasFeature(1, 'x');
      expect(result).toBe(false);
    });
  });

  describe('getFeatureResolutionDetails', () => {
    it('throws when cafe not found', async () => {
      Cafe.getById.mockResolvedValue(null);
      await expect(featureService.getFeatureResolutionDetails(999)).rejects.toThrow('Cafe not found');
    });
    it('returns details with features and overrides', async () => {
      Cafe.getById.mockResolvedValue({ id: 1, name: 'C', subscription_plan: 'PRO', subscription_status: 'active' });
      Feature.getAll.mockResolvedValue([{ key: 'orders', name: 'Orders', default_free: true, default_pro: true }]);
      Feature.getCafeOverrides.mockResolvedValue({});
      const result = await featureService.getFeatureResolutionDetails(1);
      expect(result).toHaveProperty('cafe');
      expect(result).toHaveProperty('features');
      expect(result.features[0]).toHaveProperty('key', 'orders');
    });
  });

  describe('toggleCafeFeature', () => {
    it('throws when feature not found', async () => {
      Feature.getByKey.mockResolvedValue(null);
      await expect(featureService.toggleCafeFeature(1, 'nonexistent', true)).rejects.toThrow('not found');
    });
    it('calls setCafeOverride and returns resolved features', async () => {
      Feature.getByKey.mockResolvedValue({ key: 'orders' });
      Feature.setCafeOverride.mockResolvedValue({});
      Cafe.getById.mockResolvedValue({ id: 1, subscription_plan: 'PRO', subscription_status: 'active' });
      Feature.getAll.mockResolvedValue([{ key: 'orders', default_free: true, default_pro: true }]);
      Feature.getCafeOverrides.mockResolvedValue({ orders: true });
      const result = await featureService.toggleCafeFeature(1, 'orders', true);
      expect(Feature.setCafeOverride).toHaveBeenCalledWith(1, 'orders', true);
      expect(result).toHaveProperty('orders');
    });
  });

  describe('removeFeatureOverride', () => {
    it('calls removeCafeOverride and returns resolved features', async () => {
      Feature.removeCafeOverride.mockResolvedValue({ success: true });
      Cafe.getById.mockResolvedValue({ id: 1, subscription_plan: 'FREE', subscription_status: 'active' });
      Feature.getAll.mockResolvedValue([{ key: 'orders', default_free: true, default_pro: true }]);
      Feature.getCafeOverrides.mockResolvedValue({});
      const result = await featureService.removeFeatureOverride(1, 'orders');
      expect(Feature.removeCafeOverride).toHaveBeenCalledWith(1, 'orders');
      expect(result).toHaveProperty('orders');
    });
    it('throws on error', async () => {
      Feature.removeCafeOverride.mockRejectedValue(new Error('DB error'));
      await expect(featureService.removeFeatureOverride(1, 'x')).rejects.toThrow('Error removing feature override');
    });
  });
});
