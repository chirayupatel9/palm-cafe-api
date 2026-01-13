const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Migration 023: Add Cafe Onboarding Support
 * 
 * This migration:
 * 1. Adds is_onboarded field to cafes table (defaults to FALSE)
 * 2. Adds onboarding_data JSON field to store onboarding progress
 * 3. Sets existing cafes to is_onboarded = TRUE (grandfathered in)
 */
async function migrateCafeOnboarding() {
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

    console.log('🔧 Starting cafe onboarding migration...');

    // Check if columns already exist
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 'cafes' 
      AND COLUMN_NAME IN ('is_onboarded', 'onboarding_data')
    `, [process.env.DB_NAME || 'cafe_app']);

    const existingColumns = columns.map(col => col.COLUMN_NAME);

    // Add is_onboarded column if it doesn't exist
    if (!existingColumns.includes('is_onboarded')) {
      await connection.execute(`
        ALTER TABLE cafes 
        ADD COLUMN is_onboarded BOOLEAN DEFAULT FALSE NOT NULL
      `);
      console.log('✅ Added is_onboarded column to cafes table');
    } else {
      console.log('ℹ️  is_onboarded column already exists');
    }

    // Add onboarding_data column if it doesn't exist
    if (!existingColumns.includes('onboarding_data')) {
      await connection.execute(`
        ALTER TABLE cafes 
        ADD COLUMN onboarding_data JSON NULL
      `);
      console.log('✅ Added onboarding_data column to cafes table');
    } else {
      console.log('ℹ️  onboarding_data column already exists');
    }

    // Set all existing cafes to onboarded (grandfathered in)
    const [updateResult] = await connection.execute(`
      UPDATE cafes 
      SET is_onboarded = TRUE 
      WHERE is_onboarded = FALSE
    `);
    console.log(`✅ Set ${updateResult.affectedRows} existing cafes to onboarded status`);

    // Add index for performance
    try {
      await connection.execute(`
        CREATE INDEX idx_is_onboarded ON cafes(is_onboarded)
      `);
      console.log('✅ Added index on is_onboarded');
    } catch (error) {
      if (error.code !== 'ER_DUP_KEYNAME') {
        throw error;
      }
      console.log('ℹ️  Index on is_onboarded already exists');
    }

    console.log('🎉 Cafe onboarding migration completed successfully!');

  } catch (error) {
    console.error('❌ Error during cafe onboarding migration:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateCafeOnboarding()
    .then(() => {
      console.log('✅ Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = migrateCafeOnboarding;
