const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Migration 027: Add Impersonation Audit Log
 * 
 * This migration creates a table to track Super Admin impersonation activities
 * for security and compliance purposes.
 */
async function migrateImpersonationAuditLog() {
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

    console.log('🔧 Starting impersonation audit log migration...');

    // Check if table already exists
    const [existingTables] = await connection.execute(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = ? AND table_name = 'impersonation_audit_log'
    `, [process.env.DB_NAME || 'cafe_app']);

    if (existingTables[0].count > 0) {
      console.log('ℹ️  impersonation_audit_log table already exists, skipping migration');
      return;
    }

    // Create impersonation_audit_log table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS impersonation_audit_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        super_admin_id INT NOT NULL,
        super_admin_email VARCHAR(200),
        cafe_id INT NOT NULL,
        cafe_slug VARCHAR(100),
        cafe_name VARCHAR(200),
        action_type ENUM('IMPERSONATION_STARTED', 'IMPERSONATION_ENDED') NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_super_admin_id (super_admin_id),
        INDEX idx_cafe_id (cafe_id),
        INDEX idx_action_type (action_type),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (super_admin_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Impersonation audit log table created');

    console.log('🎉 Impersonation audit log migration completed successfully!');

  } catch (error) {
    console.error('❌ Error during impersonation audit log migration:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateImpersonationAuditLog()
    .then(() => {
      console.log('✅ Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = migrateImpersonationAuditLog;
