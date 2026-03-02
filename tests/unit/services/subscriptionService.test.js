/**
 * Unit tests for subscriptionService. Cafe and featureService mocked.
 */
jest.mock('../../../models/cafe');
jest.mock('../../../services/featureService');
jest.mock('../../../services/auditService');

const Cafe = require('../../../models/cafe');
const featureService = require('../../../services/featureService');
const subscriptionService = require('../../../services/subscriptionService');

describe('subscriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllModules', () => {
    it('returns array of module strings', () => {
      const result = subscriptionService.getAllModules();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toContain('orders');
      expect(result).toContain('inventory');
    });
  });

  describe('getAllPlans', () => {
    it('returns FREE and PRO', () => {
      const result = subscriptionService.getAllPlans();
      expect(result).toContain('FREE');
      expect(result).toContain('PRO');
    });
  });

  describe('getAllStatuses', () => {
    it('returns active, inactive, expired', () => {
      const result = subscriptionService.getAllStatuses();
      expect(result).toContain('active');
      expect(result).toContain('inactive');
      expect(result).toContain('expired');
    });
  });

  describe('getPlanFeatures', () => {
    it('returns array for FREE', () => {
      const result = subscriptionService.getPlanFeatures('FREE');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toContain('orders');
    });
    it('returns array for PRO', () => {
      const result = subscriptionService.getPlanFeatures('PRO');
      expect(result).toContain('inventory');
    });
    it('returns empty array for unknown plan', () => {
      const result = subscriptionService.getPlanFeatures('UNKNOWN');
      expect(result).toEqual([]);
    });
  });

  describe('planHasModule', () => {
    it('returns true when plan has module', () => {
      expect(subscriptionService.planHasModule('PRO', 'inventory')).toBe(true);
    });
    it('returns false when plan does not have module', () => {
      expect(subscriptionService.planHasModule('FREE', 'inventory')).toBe(false);
    });
  });

  describe('getCafeSubscription', () => {
    it('returns null when cafe not found', async () => {
      Cafe.getById.mockResolvedValue(null);
      const result = await subscriptionService.getCafeSubscription(999);
      expect(result).toBeNull();
    });
    it('returns plan and status when cafe found', async () => {
      Cafe.getById.mockResolvedValue({
        id: 1,
        subscription_plan: 'PRO',
        subscription_status: 'active',
        enabled_modules: null
      });
      const result = await subscriptionService.getCafeSubscription(1);
      expect(result).toHaveProperty('plan', 'PRO');
      expect(result).toHaveProperty('status', 'active');
    });
    it('normalizes plan to uppercase', async () => {
      Cafe.getById.mockResolvedValue({
        id: 1,
        subscription_plan: 'pro',
        subscription_status: 'active'
      });
      const result = await subscriptionService.getCafeSubscription(1);
      expect(result.plan).toBe('PRO');
    });
    it('parses enabled_modules JSON string', async () => {
      Cafe.getById.mockResolvedValue({
        id: 1,
        subscription_plan: 'FREE',
        subscription_status: 'active',
        enabled_modules: '["orders"]'
      });
      const result = await subscriptionService.getCafeSubscription(1);
      expect(result.enabledModules).toEqual(['orders']);
    });
    it('throws on error', async () => {
      Cafe.getById.mockRejectedValue(new Error('DB error'));
      await expect(subscriptionService.getCafeSubscription(1)).rejects.toThrow('Error fetching cafe subscription');
    });
  });

  describe('cafeHasModuleAccess', () => {
    it('returns result of featureService.cafeHasFeature', async () => {
      featureService.cafeHasFeature.mockResolvedValue(true);
      const result = await subscriptionService.cafeHasModuleAccess(1, 'orders');
      expect(result).toBe(true);
      expect(featureService.cafeHasFeature).toHaveBeenCalledWith(1, 'orders');
    });
    it('returns false on error', async () => {
      featureService.cafeHasFeature.mockRejectedValue(new Error('fail'));
      const result = await subscriptionService.cafeHasModuleAccess(1, 'x');
      expect(result).toBe(false);
    });
  });

  describe('updateCafeSubscription', () => {
    it('throws when cafe not found', async () => {
      Cafe.getById.mockResolvedValue(null);
      await expect(subscriptionService.updateCafeSubscription(999, { plan: 'PRO' })).rejects.toThrow('Cafe not found');
    });
    it('throws when invalid plan', async () => {
      Cafe.getById.mockResolvedValue({ id: 1, subscription_plan: 'FREE', subscription_status: 'active' });
      await expect(subscriptionService.updateCafeSubscription(1, { plan: 'INVALID' })).rejects.toThrow('Invalid subscription plan');
    });
    it('throws when invalid status', async () => {
      Cafe.getById.mockResolvedValue({ id: 1 });
      Cafe.update = jest.fn();
      await expect(subscriptionService.updateCafeSubscription(1, { status: 'invalid' })).rejects.toThrow('Invalid subscription status');
    });
    it('throws when no subscription data', async () => {
      Cafe.getById.mockResolvedValue({ id: 1 });
      await expect(subscriptionService.updateCafeSubscription(1, {})).rejects.toThrow('No subscription data');
    });
  });
});
