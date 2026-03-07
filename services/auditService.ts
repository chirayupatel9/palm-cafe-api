import { pool } from '../config/database';
import logger from '../config/logger';

/**
 * Audit Service
 * Handles subscription and feature change audit logging.
 * All changes are immutable (append-only).
 */

export const ACTION_TYPES = {
  PLAN_CHANGED: 'PLAN_CHANGED',
  FEATURE_ENABLED: 'FEATURE_ENABLED',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  CAFE_ACTIVATED: 'CAFE_ACTIVATED',
  CAFE_DEACTIVATED: 'CAFE_DEACTIVATED'
} as const;

export async function logAuditEvent(
  cafeId: number,
  actionType: string,
  previousValue: string,
  newValue: string,
  changedBy: number | null = null
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!Object.values(ACTION_TYPES).includes(actionType as typeof ACTION_TYPES[keyof typeof ACTION_TYPES])) {
      throw new Error(`Invalid action type: ${actionType}`);
    }

    await pool.execute(
      `INSERT INTO subscription_audit_log (cafe_id, action_type, previous_value, new_value, changed_by)
       VALUES (?, ?, ?, ?, ?)`,
      [cafeId, actionType, previousValue, newValue, changedBy]
    );

    return { success: true };
  } catch (error) {
    logger.error('Error logging audit event', { message: (error as Error).message });
    return { success: false, error: (error as Error).message };
  }
}

export async function getCafeAuditLog(
  cafeId: number,
  limit: number = 100,
  offset: number = 0
): Promise<unknown[]> {
  try {
    const lim = Math.max(0, parseInt(String(limit), 10) || 0);
    const off = Math.max(0, parseInt(String(offset), 10) || 0);
    const [rows] = await pool.execute(
      `SELECT 
        sal.*,
        u.username as changed_by_username,
        c.name as cafe_name
      FROM subscription_audit_log sal
      LEFT JOIN users u ON sal.changed_by = u.id
      LEFT JOIN cafes c ON sal.cafe_id = c.id
      WHERE sal.cafe_id = ?
      ORDER BY sal.created_at DESC
      LIMIT ${lim} OFFSET ${off}`,
      [cafeId]
    );

    return (rows as unknown[]) || [];
  } catch (error) {
    throw new Error(`Error fetching audit log: ${(error as Error).message}`);
  }
}

export async function getAllAuditLogs(
  limit: number = 100,
  offset: number = 0,
  cafeId: number | null = null
): Promise<unknown[]> {
  try {
    let query = `
      SELECT 
        sal.*,
        u.username as changed_by_username,
        c.name as cafe_name
      FROM subscription_audit_log sal
      LEFT JOIN users u ON sal.changed_by = u.id
      LEFT JOIN cafes c ON sal.cafe_id = c.id
    `;

    const params: (number | null)[] = [];

    if (cafeId) {
      query += ' WHERE sal.cafe_id = ?';
      params.push(cafeId);
    }

    const lim = Math.max(0, parseInt(String(limit), 10) || 0);
    const off = Math.max(0, parseInt(String(offset), 10) || 0);
    query += ` ORDER BY sal.created_at DESC LIMIT ${lim} OFFSET ${off}`;

    const [rows] = await pool.execute(query, params);
    return (rows as unknown[]) || [];
  } catch (error) {
    throw new Error(`Error fetching audit logs: ${(error as Error).message}`);
  }
}

export async function getAuditLogStats(cafeId: number | null = null): Promise<unknown[]> {
  try {
    let query = `
      SELECT 
        action_type,
        COUNT(*) as count
      FROM subscription_audit_log
    `;

    const params: number[] = [];

    if (cafeId) {
      query += ' WHERE cafe_id = ?';
      params.push(cafeId);
    }

    query += ' GROUP BY action_type';

    const [rows] = await pool.execute(query, params);
    return (rows as unknown[]) || [];
  } catch (error) {
    throw new Error(`Error fetching audit log stats: ${(error as Error).message}`);
  }
}
