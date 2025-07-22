const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'palm_cafe_dev';

async function runMigration() {
  let connection;
  
  try {
    console.log('🔌 Connecting to database for INR migration...');
    connection = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME
    });
    console.log('✅ Connected to database');

    // Check if currency_settings table exists
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'currency_settings'
    `, [DB_NAME]);

    if (tables.length === 0) {
      console.log('ℹ️  currency_settings table does not exist, skipping migration');
      return;
    }

    // Check current currency settings
    const [currentSettings] = await connection.execute(`
      SELECT currency_code, currency_symbol, currency_name 
      FROM currency_settings 
      WHERE is_active = TRUE 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    if (currentSettings.length > 0) {
      const current = currentSettings[0];
      if (current.currency_code === 'INR') {
        console.log('ℹ️  INR is already the default currency');
        return;
      }
      
      console.log(`📝 Current currency: ${current.currency_code} (${current.currency_symbol})`);
      console.log('📝 Updating to INR as default currency...');
    }

    // Deactivate all current currency settings
    await connection.execute('UPDATE currency_settings SET is_active = FALSE');
    console.log('✅ Deactivated existing currency settings');

    // Insert INR as the new active currency
    await connection.execute(`
      INSERT INTO currency_settings (currency_code, currency_symbol, currency_name, is_active) 
      VALUES ('INR', '₹', 'Indian Rupee', TRUE)
    `);
    console.log('✅ Set INR as default currency');

    // Add to history
    await connection.execute(`
      INSERT INTO currency_settings_history (currency_code, currency_symbol, currency_name, changed_by) 
      VALUES ('INR', '₹', 'Indian Rupee', 'system')
    `);
    console.log('✅ Added INR to currency history');

    // Update sample menu items to INR prices if they exist
    const [menuItems] = await connection.execute('SELECT COUNT(*) as count FROM menu_items');
    if (menuItems[0].count > 0) {
      console.log('📝 Updating sample menu item prices to INR...');
      
      // Update prices (rough conversion: multiply by ~30 for USD to INR)
      const priceUpdates = [
        { name: 'Espresso', newPrice: 120.00 },
        { name: 'Cappuccino', newPrice: 150.00 },
        { name: 'Latte', newPrice: 140.00 },
        { name: 'Caesar Salad', newPrice: 280.00 },
        { name: 'Bruschetta', newPrice: 220.00 },
        { name: 'Grilled Chicken', newPrice: 450.00 },
        { name: 'Pasta Carbonara', newPrice: 380.00 },
        { name: 'Chocolate Cake', newPrice: 200.00 },
        { name: 'Tiramisu', newPrice: 250.00 },
        { name: 'Chef\'s Special', newPrice: 550.00 }
      ];

      for (const item of priceUpdates) {
        await connection.execute(
          'UPDATE menu_items SET price = ? WHERE name = ?',
          [item.newPrice, item.name]
        );
      }
      console.log('✅ Updated menu item prices to INR');
    }

    console.log('🎉 INR migration completed successfully!');

  } catch (error) {
    console.error('❌ INR migration failed:', error);
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
      console.log('✅ INR migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ INR migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigration }; 