const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrateColorScheme() {
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

    console.log('🔧 Starting color scheme migration...');

    // Check if columns already exist
    const [existingColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'cafe_settings' 
      AND COLUMN_NAME IN ('light_primary_color', 'light_secondary_color', 'light_accent_color', 'light_background_color', 'light_text_color', 'dark_primary_color', 'dark_secondary_color', 'dark_accent_color', 'dark_background_color', 'dark_text_color')
    `, [process.env.DB_NAME || 'cafe_app']);

    if (existingColumns.length > 0) {
      console.log('ℹ️  Color scheme columns already exist, skipping migration');
      return;
    }

    // Add color scheme columns to cafe_settings table
    await connection.execute(`
      ALTER TABLE cafe_settings 
      ADD COLUMN light_primary_color VARCHAR(7) DEFAULT '#3B82F6',
      ADD COLUMN light_secondary_color VARCHAR(7) DEFAULT '#6B7280',
      ADD COLUMN light_accent_color VARCHAR(7) DEFAULT '#10B981',
      ADD COLUMN light_background_color VARCHAR(7) DEFAULT '#FFFFFF',
      ADD COLUMN light_text_color VARCHAR(7) DEFAULT '#1F2937',
      ADD COLUMN dark_primary_color VARCHAR(7) DEFAULT '#60A5FA',
      ADD COLUMN dark_secondary_color VARCHAR(7) DEFAULT '#9CA3AF',
      ADD COLUMN dark_accent_color VARCHAR(7) DEFAULT '#34D399',
      ADD COLUMN dark_background_color VARCHAR(7) DEFAULT '#111827',
      ADD COLUMN dark_text_color VARCHAR(7) DEFAULT '#F9FAFB'
    `);
    console.log('✅ Color scheme columns added to cafe_settings table');

    // Add color scheme columns to cafe_settings_history table
    await connection.execute(`
      ALTER TABLE cafe_settings_history 
      ADD COLUMN light_primary_color VARCHAR(7) DEFAULT '#3B82F6',
      ADD COLUMN light_secondary_color VARCHAR(7) DEFAULT '#6B7280',
      ADD COLUMN light_accent_color VARCHAR(7) DEFAULT '#10B981',
      ADD COLUMN light_background_color VARCHAR(7) DEFAULT '#FFFFFF',
      ADD COLUMN light_text_color VARCHAR(7) DEFAULT '#1F2937',
      ADD COLUMN dark_primary_color VARCHAR(7) DEFAULT '#60A5FA',
      ADD COLUMN dark_secondary_color VARCHAR(7) DEFAULT '#9CA3AF',
      ADD COLUMN dark_accent_color VARCHAR(7) DEFAULT '#34D399',
      ADD COLUMN dark_background_color VARCHAR(7) DEFAULT '#111827',
      ADD COLUMN dark_text_color VARCHAR(7) DEFAULT '#F9FAFB'
    `);
    console.log('✅ Color scheme columns added to cafe_settings_history table');

    // Update existing records to have default color scheme settings
    await connection.execute(`
      UPDATE cafe_settings 
      SET light_primary_color = '#3B82F6',
          light_secondary_color = '#6B7280',
          light_accent_color = '#10B981',
          light_background_color = '#FFFFFF',
          light_text_color = '#1F2937',
          dark_primary_color = '#60A5FA',
          dark_secondary_color = '#9CA3AF',
          dark_accent_color = '#34D399',
          dark_background_color = '#111827',
          dark_text_color = '#F9FAFB'
      WHERE light_primary_color IS NULL
    `);
    console.log('✅ Updated existing cafe settings with default color scheme');

    console.log('🎉 Color scheme migration completed successfully!');

  } catch (error) {
    console.error('❌ Error during color scheme migration:', error);
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
  migrateColorScheme()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateColorScheme }; 