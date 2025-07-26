const { pool } = require('../config/database');

const addSplitPaymentFields = async () => {
  try {
    console.log('🔄 Adding split payment fields to orders table...');
    
    // Add split payment columns to orders table
    await pool.execute(`
      ALTER TABLE orders 
      ADD COLUMN split_payment BOOLEAN DEFAULT FALSE,
      ADD COLUMN split_payment_method VARCHAR(50) NULL,
      ADD COLUMN split_amount DECIMAL(10,2) DEFAULT 0.00
    `);
    
    console.log('✅ Split payment fields added successfully');
  } catch (error) {
    console.error('❌ Error adding split payment fields:', error);
    throw error;
  }
};

const removeSplitPaymentFields = async () => {
  try {
    console.log('🔄 Removing split payment fields from orders table...');
    
    // Remove split payment columns from orders table
    await pool.execute(`
      ALTER TABLE orders 
      DROP COLUMN split_payment,
      DROP COLUMN split_payment_method,
      DROP COLUMN split_amount
    `);
    
    console.log('✅ Split payment fields removed successfully');
  } catch (error) {
    console.error('❌ Error removing split payment fields:', error);
    throw error;
  }
};

// Run migration
const runMigration = async () => {
  try {
    await addSplitPaymentFields();
    console.log('🎉 Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  }
};

// Export for use in other scripts
module.exports = {
  addSplitPaymentFields,
  removeSplitPaymentFields,
  runMigration
};

// Run if called directly
if (require.main === module) {
  runMigration();
} 