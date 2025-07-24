const { pool } = require('../config/database');

async function addPointsAwardedField() {
  try {
    console.log('🔄 Starting migration: Add points_awarded field to orders table...');
    
    const connection = await pool.getConnection();
    
    // Check if the field already exists
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'orders' 
      AND COLUMN_NAME = 'points_awarded'
    `);
    
    if (columns.length === 0) {
      // Add points_awarded field
      await connection.execute(`
        ALTER TABLE orders 
        ADD COLUMN points_awarded BOOLEAN DEFAULT FALSE 
        AFTER points_redeemed
      `);
      console.log('✅ Added points_awarded field to orders table');
      
      // Update existing completed orders to mark points as awarded
      await connection.execute(`
        UPDATE orders 
        SET points_awarded = TRUE 
        WHERE status = 'completed'
      `);
      console.log('✅ Updated existing completed orders to mark points as awarded');
    } else {
      console.log('ℹ️ points_awarded field already exists');
    }
    
    connection.release();
    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  addPointsAwardedField()
    .then(() => {
      console.log('🎉 Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addPointsAwardedField; 