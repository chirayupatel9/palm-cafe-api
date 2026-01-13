const { pool } = require('../config/database');

/**
 * Audit Service
 * 
 * Handles subscription and feature change audit logging.
 * All changes are immutable (append-only).
 */

const ACTION_TYPES = {
  PLAN_CHANGED: 'PLAN_CHANGED',
  FEATURE_ENABLED: 'FEATURE_ENABLED',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  CAFE_ACTIVATED: 'CAFE_ACTIVATED',
  CAFE_DEACTIVATED: 'CAFE_DEACTIVATED'
};

/**
 * Log an audit event
 */
async function logAuditEvent(cafeId, actionType, previousValue, newValue, changedBy = null) {
  try {
    if (!Object.values(ACTION_TYPES).includes(actionType)) {
      throw new Error(`Invalid action type: ${actionType}`);
    }

    await pool.execute(`
      INSERT INTO subscription_audit_log (cafe_id, action_type, previous_value, new_value, changed_by)
      VALUES (?, ?, ?, ?, ?)
    `, [cafeId, actionType, previousValue, newValue, changedBy]);

    return { success: true };
  } catch (error) {
    console.error('Error logging audit event:', error);
    // Don't throw - audit logging should not break the main flow
    return { success: false, error: error.message };
  }
}

/**
 * Get audit log for a cafe
 */
async function getCafeAuditLog(cafeId, limit = 100, offset = 0) {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        sal.*,
        u.username as changed_by_username,
        c.name as cafe_name
      FROM subscription_audit_log sal
      LEFT JOIN users u ON sal.changed_by = u.id
      LEFT JOIN cafes c ON sal.cafe_id = c.id
      WHERE sal.cafe_id = ?
      ORDER BY sal.created_at DESC
      LIMIT ? OFFSET ?
    `, [cafeId, limit, offset]);

    return rows;
  } catch (error) {
    throw new Error(`Error fetching audit log: ${error.message}`);
  }
}

/**
 * Get all audit logs (for Super Admin)
 */
async function getAllAuditLogs(limit = 100, offset = 0, cafeId = null) {
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
    
    const params = [];
    
    if (cafeId) {
      query += ' WHERE sal.cafe_id = ?';
      params.push(cafeId);
    }
    
    query += ' ORDER BY sal.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await pool.execute(query, params);
    return rows;
  } catch (error) {
    throw new Error(`Error fetching audit logs: ${error.message}`);
  }
}

/**
 * Get audit log statistics
 */
async function getAuditLogStats(cafeId = null) {
  try {
    let query = `
      SELECT 
        action_type,
        COUNT(*) as count
      FROM subscription_audit_log
    `;
    
    const params = [];
    
    if (cafeId) {
      query += ' WHERE cafe_id = ?';
      params.push(cafeId);
    }
    
    query += ' GROUP BY action_type';

    const [rows] = await pool.execute(query, params);
    return rows;
  } catch (error) {
    throw new Error(`Error fetching audit log stats: ${error.message}`);
  }
}

module.exports = {
  ACTION_TYPES,
  logAuditEvent,
  getCafeAuditLog,
  getAllAuditLogs,
  getAuditLogStats
};
