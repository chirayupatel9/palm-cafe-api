const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Migration 024: Add Cafe Daily Metrics Table
 * 
 * This migration:
 * 1. Creates the cafe_daily_metrics table for aggregated analytics
 * 2. Adds indexes for performance
 * 3. Ensures unique constraint on cafe_id + date
 */
async function migrateCafeDailyMetrics() {
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

    console.log('🔧 Starting cafe daily metrics migration...');

    // Create cafe_daily_metrics table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS cafe_daily_metrics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_id INT NOT NULL,
        date DATE NOT NULL,
        total_orders INT DEFAULT 0,
        total_revenue DECIMAL(10, 2) DEFAULT 0.00,
        completed_orders INT DEFAULT 0,
        completed_revenue DECIMAL(10, 2) DEFAULT 0.00,
        total_customers INT DEFAULT 0,
        new_customers INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_cafe_date (cafe_id, date),
        INDEX idx_cafe_id (cafe_id),
        INDEX idx_date (date),
        INDEX idx_cafe_date (cafe_id, date),
        FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Cafe daily metrics table created');

    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateCafeDailyMetrics()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = migrateCafeDailyMetrics;
