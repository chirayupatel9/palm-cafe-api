const { pool } = require('./config/database');

async function addPointsRedeemedColumn() {
  const connection = await pool.getConnection();

  try {
    console.log('🔄 Adding points_redeemed column to orders table...');

    // Check if the column already exists
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND COLUMN_NAME = 'points_redeemed'
    `);

    if (columns.length === 0) {
      // Add the points_redeemed column
      await connection.execute(`
        ALTER TABLE orders
        ADD COLUMN points_redeemed INT DEFAULT 0
        AFTER tip_amount
      `);
      console.log('✅ points_redeemed column added to orders table');
    } else {
      console.log('ℹ️ points_redeemed column already exists');
    }

  } catch (error) {
    console.error('❌ Error adding points_redeemed column:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Run the migration
addPointsRedeemedColumn()
  .then(() => {
    console.log('✅ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }); 