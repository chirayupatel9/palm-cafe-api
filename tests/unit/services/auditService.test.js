/**
 * Unit tests for auditService. DB mocked.
 */
const mockExecute = jest.fn();
jest.mock('../../../config/database', () => ({
  pool: { execute: (...args) => mockExecute(...args) }
}));
jest.mock('../../../config/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));

const logger = require('../../../config/logger');
const {
  ACTION_TYPES,
  logAuditEvent,
  getCafeAuditLog,
  getAllAuditLogs,
  getAuditLogStats
} = require('../../../services/auditService');

describe('auditService', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    logger.error.mockClear();
  });

  describe('ACTION_TYPES', () => {
    it('exports expected action types', () => {
      expect(ACTION_TYPES.PLAN_CHANGED).toBe('PLAN_CHANGED');
      expect(ACTION_TYPES.FEATURE_ENABLED).toBe('FEATURE_ENABLED');
      expect(ACTION_TYPES.FEATURE_DISABLED).toBe('FEATURE_DISABLED');
      expect(ACTION_TYPES.CAFE_ACTIVATED).toBe('CAFE_ACTIVATED');
      expect(ACTION_TYPES.CAFE_DEACTIVATED).toBe('CAFE_DEACTIVATED');
    });
  });

  describe('logAuditEvent', () => {
    it('returns success when insert succeeds', async () => {
      mockExecute.mockResolvedValue([{ insertId: 1 }]);
      const result = await logAuditEvent(1, ACTION_TYPES.PLAN_CHANGED, 'FREE', 'PRO', 10);
      expect(result).toEqual({ success: true });
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO subscription_audit_log'),
        [1, 'PLAN_CHANGED', 'FREE', 'PRO', 10]
      );
    });

    it('accepts null changedBy', async () => {
      mockExecute.mockResolvedValue([{ insertId: 1 }]);
      await logAuditEvent(1, ACTION_TYPES.CAFE_ACTIVATED, null, 1, null);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.any(String),
        [1, 'CAFE_ACTIVATED', null, 1, null]
      );
    });

    it('returns success false for invalid action type without throwing', async () => {
      const result = await logAuditEvent(1, 'INVALID', null, null);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid action type: INVALID');
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('returns success false on error without throwing', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      const result = await logAuditEvent(1, ACTION_TYPES.PLAN_CHANGED, 'a', 'b');
      expect(result).toEqual({ success: false, error: 'DB error' });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getCafeAuditLog', () => {
    it('returns rows for cafeId with default limit/offset', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, cafe_id: 1 }]]);
      const result = await getCafeAuditLog(1);
      expect(result).toHaveLength(1);
      expect(result[0].cafe_id).toBe(1);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE sal.cafe_id = ?'),
        [1]
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 100 OFFSET 0'),
        [1]
      );
    });

    it('uses custom limit and offset', async () => {
      mockExecute.mockResolvedValue([[]]);
      await getCafeAuditLog(1, 50, 10);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 50 OFFSET 10'),
        [1]
      );
    });

    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('fail'));
      await expect(getCafeAuditLog(1)).rejects.toThrow('Error fetching audit log: fail');
    });
  });

  describe('getAllAuditLogs', () => {
    it('returns rows without cafeId filter', async () => {
      mockExecute.mockResolvedValue([[{ id: 1 }, { id: 2 }]]);
      const result = await getAllAuditLogs(100, 0);
      expect(result).toHaveLength(2);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY sal.created_at DESC LIMIT 100 OFFSET 0'),
        []
      );
    });

    it('filters by cafeId when provided', async () => {
      mockExecute.mockResolvedValue([[]]);
      await getAllAuditLogs(10, 5, 3);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE sal.cafe_id = ?'),
        [3]
      );
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 10 OFFSET 5'),
        [3]
      );
    });

    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('fail'));
      await expect(getAllAuditLogs()).rejects.toThrow('Error fetching audit logs: fail');
    });
  });

  describe('getAuditLogStats', () => {
    it('returns stats without cafeId', async () => {
      mockExecute.mockResolvedValue([[{ action_type: 'PLAN_CHANGED', count: 5 }]]);
      const result = await getAuditLogStats();
      expect(result).toHaveLength(1);
      expect(result[0].action_type).toBe('PLAN_CHANGED');
      expect(result[0].count).toBe(5);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY action_type'),
        []
      );
    });

    it('filters by cafeId when provided', async () => {
      mockExecute.mockResolvedValue([[]]);
      await getAuditLogStats(2);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE cafe_id = ?'),
        [2]
      );
    });

    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('fail'));
      await expect(getAuditLogStats()).rejects.toThrow('Error fetching audit log stats: fail');
    });
  });
});
