const mysql = require('mysql2/promise');
require('dotenv').config();

async function addTableNumberField() {
  let connection;
  
  try {
    console.log('🔌 Connecting to database...');
    
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 3306,
      database: process.env.DB_NAME || 'cafe_app'
    });

    console.log('✅ Connected to database successfully');

    // Add table_number column to orders table
    console.log('📝 Adding table_number column to orders table...');
    
    await connection.execute(`
      ALTER TABLE orders 
      ADD COLUMN table_number VARCHAR(20) NULL 
      AFTER customer_phone
    `);

    console.log('✅ table_number column added successfully');

    // Add index for better performance when filtering by table
    console.log('📊 Adding index for table_number...');
    
    await connection.execute(`
      CREATE INDEX idx_table_number ON orders(table_number)
    `);

    console.log('✅ Index created successfully');

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
  addTableNumberField()
    .then(() => {
      console.log('✅ Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addTableNumberField;
