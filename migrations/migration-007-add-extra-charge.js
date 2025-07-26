const { pool } = require('../config/database');

async function addExtraChargeFields() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔄 Starting migration: Add extra charge fields to orders table...');
    
    // Add extra_charge column
    await connection.execute(`
      ALTER TABLE orders 
      ADD COLUMN extra_charge DECIMAL(10,2) DEFAULT 0.00
    `);
    console.log('✅ Added extra_charge column');
    
    // Add extra_charge_note column
    await connection.execute(`
      ALTER TABLE orders 
      ADD COLUMN extra_charge_note VARCHAR(255) NULL
    `);
    console.log('✅ Added extra_charge_note column');
    
    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  addExtraChargeFields()
    .then(() => {
      console.log('✅ Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addExtraChargeFields }; 