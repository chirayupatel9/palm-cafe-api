const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'cafe_app_dev';

async function autoGenerateCategories() {
  let connection;
  
  try {
    console.log('🔌 Connecting to database for auto-generating categories...');
    connection = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME
    });
    console.log('✅ Connected to database');

    // Import the Category model
    const Category = require('../models/category');
    
    console.log('🔄 Auto-generating categories from menu items...');
    const categories = await Category.generateFromMenuItems();
    
    console.log('✅ Categories auto-generated successfully!');
    console.log('\n📋 Generated Categories:');
    categories.forEach((category, index) => {
      console.log(`  ${index + 1}. ${category.name} (${category.item_count} items)`);
    });

  } catch (error) {
    console.error('❌ Auto-generation failed:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run if called directly
if (require.main === module) {
  autoGenerateCategories()
    .then(() => {
      console.log('✅ Auto-generation script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Auto-generation script failed:', error);
      process.exit(1);
    });
}

module.exports = { autoGenerateCategories }; 