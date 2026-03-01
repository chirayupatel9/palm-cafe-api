/**
 * Unit tests for subscriptionAuth middleware.
 */
jest.mock('../../../services/subscriptionService');
jest.mock('../../../services/featureService');

const subscriptionService = require('../../../services/subscriptionService');
const featureService = require('../../../services/featureService');
const {
  requireActiveSubscription,
  requireFeature,
  requireModule,
  attachSubscriptionInfo
} = require('../../../middleware/subscriptionAuth');

describe('subscriptionAuth middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = { user: { cafe_id: 1 }, cafeId: null };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('requireActiveSubscription', () => {
    it('returns 400 when no cafeId', async () => {
      req.user = null;
      req.cafeId = null;
      await requireActiveSubscription(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CAFE_ID_REQUIRED' }));
      expect(next).not.toHaveBeenCalled();
    });
    it('uses req.cafeId when set', async () => {
      req.cafeId = 5;
      req.user = null;
      subscriptionService.getCafeSubscription.mockResolvedValue({ plan: 'FREE', status: 'active' });
      await requireActiveSubscription(req, res, next);
      expect(subscriptionService.getCafeSubscription).toHaveBeenCalledWith(5);
    });
    it('returns 404 when cafe not found', async () => {
      subscriptionService.getCafeSubscription.mockResolvedValue(null);
      await requireActiveSubscription(req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CAFE_NOT_FOUND' }));
    });
    it('returns 403 when subscription inactive', async () => {
      subscriptionService.getCafeSubscription.mockResolvedValue({ plan: 'FREE', status: 'inactive' });
      await requireActiveSubscription(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SUBSCRIPTION_INACTIVE' }));
    });
    it('calls next and attaches subscription when active', async () => {
      subscriptionService.getCafeSubscription.mockResolvedValue({ plan: 'PRO', status: 'active' });
      await requireActiveSubscription(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.subscription).toEqual({ plan: 'PRO', status: 'active' });
    });
    it('returns 500 on error', async () => {
      subscriptionService.getCafeSubscription.mockRejectedValue(new Error('fail'));
      await requireActiveSubscription(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('requireFeature', () => {
    it('returns 400 when no cafeId', async () => {
      req.user = null;
      const mw = requireFeature('orders');
      await mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
    it('calls next when user is superadmin', async () => {
      req.user = { role: 'superadmin', cafe_id: 1 };
      featureService.cafeHasFeature.mockResolvedValue(false);
      const mw = requireFeature('orders');
      await mw(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(featureService.cafeHasFeature).not.toHaveBeenCalled();
    });
    it('returns 403 when feature not allowed', async () => {
      featureService.cafeHasFeature.mockResolvedValue(false);
      subscriptionService.getCafeSubscription.mockResolvedValue({ plan: 'FREE' });
      const mw = requireFeature('inventory');
      await mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'FEATURE_ACCESS_DENIED' }));
    });
    it('calls next when feature allowed', async () => {
      featureService.cafeHasFeature.mockResolvedValue(true);
      subscriptionService.getCafeSubscription.mockResolvedValue({ plan: 'PRO' });
      const mw = requireFeature('inventory');
      await mw(req, res, next);
      expect(next).toHaveBeenCalled();
    });
    it('returns 500 on error', async () => {
      featureService.cafeHasFeature.mockRejectedValue(new Error('fail'));
      const mw = requireFeature('orders');
      await mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('requireModule', () => {
    it('returns same middleware as requireFeature', () => {
      const mw = requireModule('orders');
      expect(typeof mw).toBe('function');
    });
  });

  describe('attachSubscriptionInfo', () => {
    it('attaches subscription when cafeId present', async () => {
      subscriptionService.getCafeSubscription.mockResolvedValue({ plan: 'FREE' });
      await attachSubscriptionInfo(req, res, next);
      expect(req.subscription).toEqual({ plan: 'FREE' });
      expect(next).toHaveBeenCalled();
    });
    it('calls next without attaching when no cafeId', async () => {
      req.user = null;
      await attachSubscriptionInfo(req, res, next);
      expect(req.subscription).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });
    it('calls next on error without blocking', async () => {
      subscriptionService.getCafeSubscription.mockRejectedValue(new Error('fail'));
      await attachSubscriptionInfo(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
