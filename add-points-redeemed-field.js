const { pool } = require('./config/database');

async function addPointsRedeemedField() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔄 Adding points_redeemed field to orders table...');
    
    // Check if the field already exists
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'orders' 
      AND COLUMN_NAME = 'points_redeemed'
    `);
    
    if (columns.length === 0) {
      // Add the points_redeemed field
      await connection.execute(`
        ALTER TABLE orders 
        ADD COLUMN points_redeemed INT DEFAULT 0 
        AFTER tip_amount
      `);
      console.log('✅ points_redeemed field added to orders table');
    } else {
      console.log('ℹ️ points_redeemed field already exists');
    }
    
  } catch (error) {
    console.error('❌ Error adding points_redeemed field:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Run the migration
addPointsRedeemedField()
  .then(() => {
    console.log('✅ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }); 