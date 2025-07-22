const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'palm_cafe_dev';

async function resetDatabase() {
  let connection;
  
  try {
    console.log('🔌 Connecting to MySQL server...');
    connection = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD
    });
    console.log('✅ Connected to MySQL server successfully');

    // Create database if it doesn't exist
    console.log(`📦 Creating database '${DB_NAME}' if it doesn't exist...`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${DB_NAME}`);
    console.log(`✅ Database '${DB_NAME}' is ready`);

    // Use the database
    await connection.query(`USE ${DB_NAME}`);
    console.log(`✅ Using database '${DB_NAME}'`);

    // Drop existing tables in reverse order of dependencies
    console.log('🗑️  Dropping existing tables...');
    
    const tablesToDrop = [
      'currency_settings_history',
      'currency_settings',
      'tax_settings_history', 
      'tax_settings',
      'invoice_items',
      'invoices',
      'order_items',
      'orders',
      'menu_items',
      'categories',
      'inventory'
    ];

    for (const table of tablesToDrop) {
      try {
        await connection.query(`DROP TABLE IF EXISTS ${table}`);
        console.log(`✅ Dropped table: ${table}`);
      } catch (error) {
        console.log(`⚠️  Could not drop table ${table}: ${error.message}`);
      }
    }

    console.log('✅ All existing tables dropped successfully');

  } catch (error) {
    console.error('❌ Error during database reset:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run the reset
resetDatabase()
  .then(() => {
    console.log('✅ Database reset completed successfully');
    console.log('🔄 Now run setup-database.js to recreate the tables');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Database reset failed:', error);
    process.exit(1);
  }); 