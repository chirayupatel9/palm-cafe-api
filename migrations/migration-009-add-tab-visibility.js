const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrateTabVisibility() {
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

    console.log('🔧 Starting tab visibility migration...');

    // Check if columns already exist
    const [existingColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'cafe_settings' 
      AND COLUMN_NAME IN ('show_kitchen_tab', 'show_customers_tab', 'show_payment_methods_tab', 'show_menu_tab', 'show_inventory_tab', 'show_history_tab')
    `, [process.env.DB_NAME || 'cafe_app']);

    if (existingColumns.length > 0) {
      console.log('ℹ️  Tab visibility columns already exist, skipping migration');
      return;
    }

    // Add tab visibility columns to cafe_settings table
    await connection.execute(`
      ALTER TABLE cafe_settings 
      ADD COLUMN show_kitchen_tab BOOLEAN DEFAULT TRUE,
      ADD COLUMN show_customers_tab BOOLEAN DEFAULT TRUE,
      ADD COLUMN show_payment_methods_tab BOOLEAN DEFAULT TRUE,
      ADD COLUMN show_menu_tab BOOLEAN DEFAULT TRUE,
      ADD COLUMN show_inventory_tab BOOLEAN DEFAULT TRUE,
      ADD COLUMN show_history_tab BOOLEAN DEFAULT TRUE
    `);
    console.log('✅ Tab visibility columns added to cafe_settings table');

    // Add tab visibility columns to cafe_settings_history table
    await connection.execute(`
      ALTER TABLE cafe_settings_history 
      ADD COLUMN show_kitchen_tab BOOLEAN DEFAULT TRUE,
      ADD COLUMN show_customers_tab BOOLEAN DEFAULT TRUE,
      ADD COLUMN show_payment_methods_tab BOOLEAN DEFAULT TRUE,
      ADD COLUMN show_menu_tab BOOLEAN DEFAULT TRUE,
      ADD COLUMN show_inventory_tab BOOLEAN DEFAULT TRUE,
      ADD COLUMN show_history_tab BOOLEAN DEFAULT TRUE
    `);
    console.log('✅ Tab visibility columns added to cafe_settings_history table');

    // Update existing records to have default visibility settings
    await connection.execute(`
      UPDATE cafe_settings 
      SET show_kitchen_tab = TRUE,
          show_customers_tab = TRUE,
          show_payment_methods_tab = TRUE,
          show_menu_tab = TRUE,
          show_inventory_tab = TRUE,
          show_history_tab = TRUE
      WHERE show_kitchen_tab IS NULL
    `);
    console.log('✅ Updated existing cafe settings with default tab visibility');

    console.log('🎉 Tab visibility migration completed successfully!');

  } catch (error) {
    console.error('❌ Error during tab visibility migration:', error);
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
  migrateTabVisibility()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateTabVisibility }; 