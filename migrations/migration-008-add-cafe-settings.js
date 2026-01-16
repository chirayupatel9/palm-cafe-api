const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrateCafeSettings() {
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

    console.log('🔧 Starting cafe settings migration...');

    // Check if cafe_settings table exists
    const [existingTables] = await connection.execute(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = ? AND table_name = 'cafe_settings'
    `, [process.env.DB_NAME || 'cafe_app']);

    if (existingTables[0].count > 0) {
      console.log('ℹ️  cafe_settings table already exists, skipping migration');
      return;
    }

    // Create cafe_settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS cafe_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_name VARCHAR(200) DEFAULT NULL,
        logo_url VARCHAR(500) DEFAULT NULL,
        address TEXT,
        phone VARCHAR(50),
        email VARCHAR(200),
        website VARCHAR(200),
        opening_hours TEXT,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Cafe settings table created');

    // Create cafe_settings_history table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS cafe_settings_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_name VARCHAR(200),
        logo_url VARCHAR(500),
        address TEXT,
        phone VARCHAR(50),
        email VARCHAR(200),
        website VARCHAR(200),
        opening_hours TEXT,
        description TEXT,
        changed_by VARCHAR(100) DEFAULT 'admin',
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Cafe settings history table created');

    console.log('🎉 Cafe settings migration completed successfully!');

  } catch (error) {
    console.error('❌ Error during cafe settings migration:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  migrateCafeSettings()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateCafeSettings }; 