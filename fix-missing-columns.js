const { pool } = require('./config/database');

async function fixMissingColumns() {
  let connection;
  
  try {
    console.log('🔧 Starting database column fixes...');
    connection = await pool.getConnection();
    
    // Check and add missing columns to orders table
    console.log('📝 Checking orders table for missing columns...');
    
    const ordersColumns = [
      { name: 'split_payment', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'split_payment_method', type: 'VARCHAR(50) NULL' },
      { name: 'split_amount', type: 'DECIMAL(10,2) DEFAULT 0.00' },
      { name: 'extra_charge', type: 'DECIMAL(10,2) DEFAULT 0.00' },
      { name: 'extra_charge_note', type: 'VARCHAR(255) NULL' },
      { name: 'points_awarded', type: 'BOOLEAN DEFAULT FALSE' }
    ];
    
    for (const column of ordersColumns) {
      try {
        await connection.execute(`
          ALTER TABLE orders 
          ADD COLUMN ${column.name} ${column.type}
        `);
        console.log(`✅ Added ${column.name} column to orders table`);
      } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          console.log(`ℹ️  Column ${column.name} already exists in orders table`);
        } else {
          console.error(`❌ Error adding ${column.name} column:`, error.message);
        }
      }
    }
    
    // Check and add missing columns to tax_settings table
    console.log('📝 Checking tax_settings table for missing columns...');
    
    const taxSettingsColumns = [
      { name: 'include_tax', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'show_tax_in_menu', type: 'BOOLEAN DEFAULT TRUE' }
    ];
    
    for (const column of taxSettingsColumns) {
      try {
        await connection.execute(`
          ALTER TABLE tax_settings 
          ADD COLUMN ${column.name} ${column.type}
        `);
        console.log(`✅ Added ${column.name} column to tax_settings table`);
      } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          console.log(`ℹ️  Column ${column.name} already exists in tax_settings table`);
        } else {
          console.error(`❌ Error adding ${column.name} column:`, error.message);
        }
      }
    }
    
    // Check if payment_methods table exists
    console.log('📝 Checking payment_methods table...');
    
    try {
      const [tables] = await connection.execute(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'payment_methods'
      `);
      
      if (tables.length === 0) {
        console.log('📝 Creating payment_methods table...');
        await connection.execute(`
          CREATE TABLE payment_methods (
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
        console.log('✅ Created payment_methods table');
        
        // Insert default payment methods
        const defaultPaymentMethods = [
          { name: 'Cash', code: 'cash', description: 'Pay with cash', icon: '💵', display_order: 1 },
          { name: 'UPI', code: 'upi', description: 'Pay using UPI', icon: '📱', display_order: 2 },
          { name: 'Card', code: 'card', description: 'Pay with credit/debit card', icon: '💳', display_order: 3 },
          { name: 'Online', code: 'online', description: 'Pay online', icon: '🌐', display_order: 4 }
        ];
        
        for (const method of defaultPaymentMethods) {
          await connection.execute(`
            INSERT INTO payment_methods (name, code, description, icon, display_order, is_active) 
            VALUES (?, ?, ?, ?, ?, ?)
          `, [method.name, method.code, method.description, method.icon, method.display_order, true]);
        }
        console.log('✅ Inserted default payment methods');
      } else {
        console.log('ℹ️  payment_methods table already exists');
      }
    } catch (error) {
      console.error('❌ Error with payment_methods table:', error.message);
    }
    
    console.log('🎉 Database column fixes completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during database fixes:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run if called directly
if (require.main === module) {
  fixMissingColumns()
    .then(() => {
      console.log('✅ Database fixes completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Database fixes failed:', error);
      process.exit(1);
    });
}

module.exports = { fixMissingColumns }; 