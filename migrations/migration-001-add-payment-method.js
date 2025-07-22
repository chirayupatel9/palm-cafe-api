const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'palm_cafe_dev';

async function runMigration() {
  let connection;
  
  try {
    console.log('🔌 Connecting to database for migration...');
    connection = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME
    });
    console.log('✅ Connected to database');

    // Check if payment_method column exists
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'payment_method'
    `, [DB_NAME]);

    if (columns.length === 0) {
      console.log('📝 Adding payment_method column to invoices table...');
      await connection.execute(`
        ALTER TABLE invoices 
        ADD COLUMN payment_method ENUM('cash', 'card', 'upi', 'online') DEFAULT 'cash'
      `);
      console.log('✅ payment_method column added successfully');
    } else {
      console.log('ℹ️  payment_method column already exists');
    }

    // Check if invoice_items table exists
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'invoice_items'
    `, [DB_NAME]);

    if (tables.length === 0) {
      console.log('📝 Creating invoice_items table...');
      await connection.execute(`
        CREATE TABLE invoice_items (
          id INT AUTO_INCREMENT PRIMARY KEY,
          invoice_number VARCHAR(50) NOT NULL,
          menu_item_id VARCHAR(36) NOT NULL,
          item_name VARCHAR(255) NOT NULL,
          price DECIMAL(10,2) NOT NULL,
          quantity INT NOT NULL,
          total DECIMAL(10,2) NOT NULL,
          FOREIGN KEY (invoice_number) REFERENCES invoices(invoice_number) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ invoice_items table created successfully');
    } else {
      console.log('ℹ️  invoice_items table already exists');
    }

    // Check if inventory table exists
    const [inventoryTables] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'inventory'
    `, [DB_NAME]);

    if (inventoryTables.length === 0) {
      console.log('📝 Creating inventory table...');
      await connection.execute(`
        CREATE TABLE inventory (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(200) NOT NULL,
          category VARCHAR(100) NOT NULL,
          quantity DECIMAL(10,3) NOT NULL DEFAULT 0,
          unit VARCHAR(50) NOT NULL,
          cost_per_unit DECIMAL(10,2) DEFAULT NULL,
          supplier VARCHAR(200) DEFAULT NULL,
          reorder_level DECIMAL(10,3) DEFAULT NULL,
          description TEXT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ inventory table created successfully');
    } else {
      console.log('ℹ️  inventory table already exists');
    }

    console.log('🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigration }; 