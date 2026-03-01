/**
 * Unit tests for impersonationService. DB mocked.
 */
const mockExecute = jest.fn();
jest.mock('../../../config/database', () => ({
  pool: { execute: (...args) => mockExecute(...args) }
}));

const {
  logImpersonationEvent,
  getImpersonationAuditLog,
  ACTION_TYPES
} = require('../../../services/impersonationService');

describe('impersonationService', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  describe('ACTION_TYPES', () => {
    it('exports IMPERSONATION_STARTED and IMPERSONATION_ENDED', () => {
      expect(ACTION_TYPES.IMPERSONATION_STARTED).toBe('IMPERSONATION_STARTED');
      expect(ACTION_TYPES.IMPERSONATION_ENDED).toBe('IMPERSONATION_ENDED');
    });
  });

  describe('logImpersonationEvent', () => {
    it('returns success when table exists and insert succeeds', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ TABLE_NAME: 'impersonation_audit_log' }]])
        .mockResolvedValueOnce([{ insertId: 1 }]);
      const result = await logImpersonationEvent(
        1, 'sa@x.com', 2, 'cafe-slug', 'Cafe Name', ACTION_TYPES.IMPERSONATION_STARTED, '1.2.3.4', 'Mozilla'
      );
      expect(result).toEqual({ success: true });
      expect(mockExecute).toHaveBeenCalledTimes(2);
      expect(mockExecute).toHaveBeenNthCalledWith(2,
        expect.stringContaining('INSERT INTO impersonation_audit_log'),
        [1, 'sa@x.com', 2, 'cafe-slug', 'Cafe Name', 'IMPERSONATION_STARTED', '1.2.3.4', 'Mozilla']
      );
    });

    it('returns success and skipped when table does not exist', async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      const result = await logImpersonationEvent(1, 'a@b.com', 1, 's', 'S', ACTION_TYPES.IMPERSONATION_ENDED);
      expect(result).toEqual({ success: true, skipped: true });
      expect(console.warn).toHaveBeenCalledWith('impersonation_audit_log table does not exist, skipping audit log');
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it('returns success false for invalid action type without throwing', async () => {
      const result = await logImpersonationEvent(1, 'a@b.com', 1, 's', 'S', 'INVALID_TYPE');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid action type: INVALID_TYPE');
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('returns success: false on DB error without throwing', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ TABLE_NAME: 'impersonation_audit_log' }]])
        .mockRejectedValue(new Error('DB fail'));
      const result = await logImpersonationEvent(1, 'a@b.com', 1, 's', 'S', ACTION_TYPES.IMPERSONATION_STARTED);
      expect(result).toEqual({ success: false, error: 'DB fail' });
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('getImpersonationAuditLog', () => {
    it('returns rows when table exists', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ TABLE_NAME: 'impersonation_audit_log' }]])
        .mockResolvedValueOnce([[{ id: 1, action_type: 'IMPERSONATION_STARTED' }]]);
      const result = await getImpersonationAuditLog(5, 10, 0);
      expect(result).toHaveLength(1);
      expect(result[0].action_type).toBe('IMPERSONATION_STARTED');
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    it('returns empty array when table does not exist', async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      const result = await getImpersonationAuditLog();
      expect(result).toEqual([]);
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it('filters by superAdminId when provided', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ TABLE_NAME: 'impersonation_audit_log' }]])
        .mockResolvedValueOnce([[]]);
      await getImpersonationAuditLog(99, 100, 5);
      expect(mockExecute).toHaveBeenNthCalledWith(2, expect.stringContaining('WHERE ial.super_admin_id = ?'), [99]);
      expect(mockExecute).toHaveBeenNthCalledWith(2, expect.stringContaining('LIMIT 100 OFFSET 5'), [99]);
    });

    it('throws on DB error', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ TABLE_NAME: 'impersonation_audit_log' }]])
        .mockRejectedValue(new Error('Connection lost'));
      await expect(getImpersonationAuditLog()).rejects.toThrow('Error fetching impersonation audit log: Connection lost');
    });
  });
});
