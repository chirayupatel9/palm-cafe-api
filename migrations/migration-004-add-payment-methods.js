const { pool } = require('../config/database');

async function addPaymentMethodsAndTaxSettings() {
  try {
    console.log('🔄 Starting migration: Add payment methods and tax settings...');
    
    const connection = await pool.getConnection();
    
    // Create payment_methods table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        icon VARCHAR(10),
        display_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Payment methods table created');

    // Add show_tax_in_menu column to tax_settings table
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tax_settings' 
      AND COLUMN_NAME = 'show_tax_in_menu'
    `);
    
    if (columns.length === 0) {
      await connection.execute(`
        ALTER TABLE tax_settings 
        ADD COLUMN show_tax_in_menu BOOLEAN DEFAULT TRUE 
        AFTER is_active
      `);
      console.log('✅ Added show_tax_in_menu column to tax_settings table');
    } else {
      console.log('ℹ️ show_tax_in_menu column already exists');
    }

    // Initialize default payment methods
    const PaymentMethod = require('../models/paymentMethod');
    await PaymentMethod.initializeDefaults();
    
    connection.release();
    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  addPaymentMethodsAndTaxSettings()
    .then(() => {
      console.log('🎉 Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addPaymentMethodsAndTaxSettings; 