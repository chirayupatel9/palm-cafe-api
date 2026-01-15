const { pool } = require('../config/database');

/**
 * Impersonation Service
 * 
 * Handles audit logging for Super Admin impersonation activities.
 * All impersonation actions are logged for security and compliance.
 */

const ACTION_TYPES = {
  IMPERSONATION_STARTED: 'IMPERSONATION_STARTED',
  IMPERSONATION_ENDED: 'IMPERSONATION_ENDED'
};

/**
 * Log impersonation event
 */
async function logImpersonationEvent(superAdminId, superAdminEmail, cafeId, cafeSlug, cafeName, actionType, ipAddress = null, userAgent = null) {
  try {
    if (!Object.values(ACTION_TYPES).includes(actionType)) {
      throw new Error(`Invalid action type: ${actionType}`);
    }

    // Check if table exists before trying to insert
    const [tables] = await pool.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'impersonation_audit_log'
    `);

    if (tables.length === 0) {
      console.warn('impersonation_audit_log table does not exist, skipping audit log');
      return { success: true, skipped: true };
    }

    await pool.execute(`
      INSERT INTO impersonation_audit_log 
        (super_admin_id, super_admin_email, cafe_id, cafe_slug, cafe_name, action_type, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [superAdminId, superAdminEmail, cafeId, cafeSlug, cafeName, actionType, ipAddress, userAgent]);

    return { success: true };
  } catch (error) {
    console.error('Error logging impersonation event:', error);
    // Don't throw - audit logging should not break the main flow
    return { success: false, error: error.message };
  }
}

/**
 * Get impersonation audit log for a Super Admin
 */
async function getImpersonationAuditLog(superAdminId = null, limit = 100, offset = 0) {
  try {
    // Check if table exists
    const [tables] = await pool.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'impersonation_audit_log'
    `);

    if (tables.length === 0) {
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
    
    const params = [];
    
    if (superAdminId) {
      query += ' WHERE ial.super_admin_id = ?';
      params.push(superAdminId);
    }
    
    query += ' ORDER BY ial.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await pool.execute(query, params);
    return rows;
  } catch (error) {
    console.error('Error fetching impersonation audit log:', error);
    throw new Error(`Error fetching impersonation audit log: ${error.message}`);
  }
}

module.exports = {
  logImpersonationEvent,
  getImpersonationAuditLog,
  ACTION_TYPES
};
