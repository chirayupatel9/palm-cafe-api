/**
 * Unit tests for onboardingAuth middleware. Cafe model mocked.
 */
jest.mock('../../../models/cafe');
jest.mock('../../../config/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
}));

const Cafe = require('../../../models/cafe');
const logger = require('../../../config/logger');
const { requireOnboarding, allowOnboardingRoutes } = require('../../../middleware/onboardingAuth');

describe('onboardingAuth', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {};
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
  });

  describe('requireOnboarding', () => {
    it('calls next when user is superadmin', async () => {
      req.user = { role: 'superadmin' };
      await requireOnboarding(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(Cafe.getById).not.toHaveBeenCalled();
    });

    it('calls next when no cafeId can be determined', async () => {
      req.user = {};
      await requireOnboarding(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(Cafe.getById).not.toHaveBeenCalled();
    });

    it('uses req.user.cafe_id when present', async () => {
      req.user = { cafe_id: 5 };
      Cafe.getById.mockResolvedValue({ id: 5, is_onboarded: true });
      await requireOnboarding(req, res, next);
      expect(Cafe.getById).toHaveBeenCalledWith(5);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('uses req.cafeId when user has no cafe_id', async () => {
      req.user = {};
      req.cafeId = 3;
      Cafe.getById.mockResolvedValue({ id: 3, is_onboarded: true });
      await requireOnboarding(req, res, next);
      expect(Cafe.getById).toHaveBeenCalledWith(3);
      expect(next).toHaveBeenCalled();
    });

    it('uses req.cafe.id when user and cafeId not set', async () => {
      req.user = {};
      req.cafe = { id: 7 };
      Cafe.getById.mockResolvedValue({ id: 7, is_onboarded: true });
      await requireOnboarding(req, res, next);
      expect(Cafe.getById).toHaveBeenCalledWith(7);
      expect(next).toHaveBeenCalled();
    });

    it('returns 404 when cafe not found', async () => {
      req.user = { cafe_id: 99 };
      Cafe.getById.mockResolvedValue(null);
      await requireOnboarding(req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cafe not found' });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 when cafe not onboarded', async () => {
      req.user = { cafe_id: 1 };
      Cafe.getById.mockResolvedValue({ id: 1, is_onboarded: false });
      await requireOnboarding(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Cafe onboarding required',
        code: 'ONBOARDING_REQUIRED',
        cafe_id: 1
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next when cafe is onboarded', async () => {
      req.user = { cafe_id: 1 };
      Cafe.getById.mockResolvedValue({ id: 1, is_onboarded: true });
      await requireOnboarding(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 500 on error', async () => {
      req.user = { cafe_id: 1 };
      Cafe.getById.mockRejectedValue(new Error('DB fail'));
      await requireOnboarding(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Error checking onboarding status' });
      expect(logger.error).toHaveBeenCalledWith('Onboarding check error', expect.objectContaining({ message: 'DB fail' }));
    });
  });

  describe('allowOnboardingRoutes', () => {
    it('always calls next', () => {
      allowOnboardingRoutes(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});
