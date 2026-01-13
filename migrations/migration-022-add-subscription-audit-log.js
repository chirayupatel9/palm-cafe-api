const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Migration 022: Add Subscription Audit Log
 * 
 * This migration:
 * 1. Creates subscription_audit_log table
 * 2. Creates indexes for performance and filtering
 */
async function migrateSubscriptionAuditLog() {
  let connection;

  try {
    // Create database connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'cafe_app',
      port: process.env.DB_PORT || 3306
    });

    console.log('🔧 Starting subscription audit log migration...');

    // Create subscription_audit_log table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS subscription_audit_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_id INT NOT NULL,
        action_type ENUM('PLAN_CHANGED', 'FEATURE_ENABLED', 'FEATURE_DISABLED', 'CAFE_ACTIVATED', 'CAFE_DEACTIVATED') NOT NULL,
        previous_value VARCHAR(255),
        new_value VARCHAR(255),
        changed_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cafe_id (cafe_id),
        INDEX idx_action_type (action_type),
        INDEX idx_created_at (created_at),
        INDEX idx_changed_by (changed_by),
        FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE CASCADE,
        FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Subscription audit log table created');

    console.log('🎉 Subscription audit log migration completed successfully!');

  } catch (error) {
    console.error('❌ Error during subscription audit log migration:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateSubscriptionAuditLog()
    .then(() => {
      console.log('✅ Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = migrateSubscriptionAuditLog;
