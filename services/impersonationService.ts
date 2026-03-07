import { pool } from '../config/database';
import logger from '../config/logger';

/**
 * Impersonation Service
 * Handles audit logging for Super Admin impersonation activities.
 */

export const ACTION_TYPES = {
  IMPERSONATION_STARTED: 'IMPERSONATION_STARTED',
  IMPERSONATION_ENDED: 'IMPERSONATION_ENDED'
} as const;

export async function logImpersonationEvent(
  superAdminId: number,
  superAdminEmail: string,
  cafeId: number,
  cafeSlug: string,
  cafeName: string,
  actionType: string,
  ipAddress: string | null = null,
  userAgent: string | null = null
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
  try {
    if (!Object.values(ACTION_TYPES).includes(actionType as typeof ACTION_TYPES[keyof typeof ACTION_TYPES])) {
      throw new Error(`Invalid action type: ${actionType}`);
    }

    const [tables] = await pool.execute(
      `SELECT TABLE_NAME 
       FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'impersonation_audit_log'`
    );

    if ((tables as unknown[]).length === 0) {
      logger.warn('impersonation_audit_log table does not exist, skipping audit log');
      return { success: true, skipped: true };
    }

    await pool.execute(
      `INSERT INTO impersonation_audit_log 
        (super_admin_id, super_admin_email, cafe_id, cafe_slug, cafe_name, action_type, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [superAdminId, superAdminEmail, cafeId, cafeSlug, cafeName, actionType, ipAddress, userAgent]
    );

    return { success: true };
  } catch (error) {
    logger.error('Error logging impersonation event', { message: (error as Error).message });
    return { success: false, error: (error as Error).message };
  }
}

export async function getImpersonationAuditLog(
  superAdminId: number | null = null,
  limit: number = 100,
  offset: number = 0
): Promise<unknown[]> {
  try {
    const [tables] = await pool.execute(
      `SELECT TABLE_NAME 
       FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'impersonation_audit_log'`
    );

    if ((tables as unknown[]).length === 0) {
      return [];
    }

    let query = `
      SELECT 
        ial.*,
        u.username as super_admin_username,
        c.name as cafe_name
      FROM impersonation_audit_log ial
      LEFT JOIN users u ON ial.super_admin_id = u.id
      LEFT JOIN cafes c ON ial.cafe_id = c.id
    `;

    const params: number[] = [];

    if (superAdminId) {
      query += ' WHERE ial.super_admin_id = ?';
      params.push(superAdminId);
    }

    const lim = Math.max(0, parseInt(String(limit), 10) || 0);
    const off = Math.max(0, parseInt(String(offset), 10) || 0);
    query += ` ORDER BY ial.created_at DESC LIMIT ${lim} OFFSET ${off}`;

    const [rows] = await pool.execute(query, params);
    return (rows as unknown[]) || [];
  } catch (error) {
    logger.error('Error fetching impersonation audit log', { message: (error as Error).message });
    throw new Error(`Error fetching impersonation audit log: ${(error as Error).message}`);
  }
}
