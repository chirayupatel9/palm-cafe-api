const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Migration 020: Add Subscription Support
 * 
 * This migration:
 * 1. Adds subscription_plan to cafes table (FREE | PRO)
 * 2. Adds subscription_status to cafes table (active | inactive | expired)
 * 3. Adds enabled_modules JSON column for per-cafe module overrides
 * 4. Sets default subscription_plan to 'FREE' for existing cafes
 * 5. Sets default subscription_status to 'active' for existing cafes
 */
async function migrateSubscriptionSupport() {
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

    console.log('🔧 Starting subscription support migration...');

    // Step 1: Add subscription_plan column
    const [planColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'cafes' 
      AND COLUMN_NAME = 'subscription_plan'
    `);
    
    if (planColumns.length === 0) {
      await connection.execute(`
        ALTER TABLE cafes 
        ADD COLUMN subscription_plan ENUM('FREE', 'PRO') DEFAULT 'FREE' NOT NULL
      `);
      console.log('✅ Added subscription_plan column');
    } else {
      console.log('ℹ️  subscription_plan column already exists');
    }

    // Step 2: Add subscription_status column
    const [statusColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'cafes' 
      AND COLUMN_NAME = 'subscription_status'
    `);
    
    if (statusColumns.length === 0) {
      await connection.execute(`
        ALTER TABLE cafes 
        ADD COLUMN subscription_status ENUM('active', 'inactive', 'expired') DEFAULT 'active' NOT NULL
      `);
      console.log('✅ Added subscription_status column');
    } else {
      console.log('ℹ️  subscription_status column already exists');
    }

    // Step 3: Add enabled_modules JSON column for per-cafe module overrides
    const [modulesColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'cafes' 
      AND COLUMN_NAME = 'enabled_modules'
    `);
    
    if (modulesColumns.length === 0) {
      await connection.execute(`
        ALTER TABLE cafes 
        ADD COLUMN enabled_modules JSON NULL
      `);
      console.log('✅ Added enabled_modules column');
    } else {
      console.log('ℹ️  enabled_modules column already exists');
    }

    // Step 4: Update existing cafes to have default subscription values
    await connection.execute(`
      UPDATE cafes 
      SET subscription_plan = 'FREE', 
          subscription_status = 'active'
      WHERE subscription_plan IS NULL OR subscription_status IS NULL
    `);
    console.log('✅ Updated existing cafes with default subscription values');

    // Step 5: Add indexes for performance
    try {
      await connection.execute(`
        CREATE INDEX idx_subscription_plan ON cafes(subscription_plan)
      `);
      console.log('✅ Added index on subscription_plan');
    } catch (error) {
      if (error.code !== 'ER_DUP_KEYNAME') {
        throw error;
      }
      console.log('ℹ️  Index on subscription_plan already exists');
    }

    try {
      await connection.execute(`
        CREATE INDEX idx_subscription_status ON cafes(subscription_status)
      `);
      console.log('✅ Added index on subscription_status');
    } catch (error) {
      if (error.code !== 'ER_DUP_KEYNAME') {
        throw error;
      }
      console.log('ℹ️  Index on subscription_status already exists');
    }

    console.log('🎉 Subscription support migration completed successfully!');

  } catch (error) {
    console.error('❌ Error during subscription support migration:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateSubscriptionSupport()
    .then(() => {
      console.log('✅ Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = migrateSubscriptionSupport;
