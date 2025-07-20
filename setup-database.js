const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  port: process.env.DB_PORT || 3306,
  multipleStatements: true
};

const databaseName = process.env.DB_NAME || 'palm_cafe';

async function createDatabase() {
  let connection;
  
  try {
    console.log('🔌 Connecting to MySQL server...');
    connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      port: dbConfig.port
    });

    console.log('✅ Connected to MySQL server successfully');

    // Create database if it doesn't exist
    console.log(`📦 Creating database '${databaseName}' if it doesn't exist...`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✅ Database '${databaseName}' is ready`);

    // Use the database
    await connection.query(`USE \`${databaseName}\``);
    console.log(`✅ Using database '${databaseName}'`);

    // Create tables
    console.log('🏗️  Creating database tables...');

    // Categories table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        sort_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Categories table created');

    // Menu items table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        category_id INT,
        is_available BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Menu items table created');

    // Orders table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        customer_name VARCHAR(200),
        customer_email VARCHAR(200),
        customer_phone VARCHAR(50),
        total_amount DECIMAL(10,2) NOT NULL,
        tax_amount DECIMAL(10,2) DEFAULT 0,
        tip_amount DECIMAL(10,2) DEFAULT 0,
        final_amount DECIMAL(10,2) NOT NULL,
        status ENUM('pending', 'preparing', 'ready', 'completed', 'cancelled') DEFAULT 'pending',
        payment_method ENUM('cash', 'card', 'online') DEFAULT 'cash',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Orders table created');

    // Order items table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        menu_item_id INT,
        item_name VARCHAR(200) NOT NULL,
        quantity INT NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        total_price DECIMAL(10,2) NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Order items table created');

    // Invoices table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        order_id INT NOT NULL,
        customer_name VARCHAR(200),
        customer_email VARCHAR(200),
        customer_phone VARCHAR(50),
        subtotal DECIMAL(10,2) NOT NULL,
        tax_amount DECIMAL(10,2) DEFAULT 0,
        tip_amount DECIMAL(10,2) DEFAULT 0,
        total_amount DECIMAL(10,2) NOT NULL,
        tax_rate DECIMAL(5,2) DEFAULT 0,
        tax_name VARCHAR(100) DEFAULT 'Tax',
        payment_method ENUM('cash', 'card', 'online') DEFAULT 'cash',
        invoice_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Invoices table created');

    // Tax settings table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tax_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tax_name VARCHAR(100) NOT NULL DEFAULT 'Sales Tax',
        tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Tax settings table created');

    // Tax settings history table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tax_settings_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tax_name VARCHAR(100) NOT NULL,
        tax_rate DECIMAL(5,2) NOT NULL,
        changed_by VARCHAR(100) DEFAULT 'system',
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Tax settings history table created');

    // Currency settings table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS currency_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        currency_code VARCHAR(3) NOT NULL DEFAULT 'USD',
        currency_symbol VARCHAR(10) NOT NULL DEFAULT '$',
        currency_name VARCHAR(100) NOT NULL DEFAULT 'US Dollar',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Currency settings table created');

    // Currency settings history table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS currency_settings_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        currency_code VARCHAR(3) NOT NULL,
        currency_symbol VARCHAR(10) NOT NULL,
        currency_name VARCHAR(100) NOT NULL,
        changed_by VARCHAR(100) DEFAULT 'system',
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Currency settings history table created');

    // Users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        email VARCHAR(200) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'user') DEFAULT 'user',
        last_login TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Users table created');

    console.log('✅ All tables created successfully');

    // Insert initial data
    console.log('📝 Inserting initial data...');

    // Insert default tax settings
    const [existingTax] = await connection.query('SELECT COUNT(*) as count FROM tax_settings');
    if (existingTax[0].count === 0) {
      await connection.query(`
        INSERT INTO tax_settings (tax_name, tax_rate) VALUES ('Sales Tax', 8.50)
      `);
      await connection.query(`
        INSERT INTO tax_settings_history (tax_name, tax_rate, changed_by) VALUES ('Sales Tax', 8.50, 'system')
      `);
      console.log('✅ Default tax settings inserted');
    }

    // Insert default currency settings
    const [existingCurrency] = await connection.query('SELECT COUNT(*) as count FROM currency_settings');
    if (existingCurrency[0].count === 0) {
      await connection.query(`
        INSERT INTO currency_settings (currency_code, currency_symbol, currency_name) VALUES ('USD', '$', 'US Dollar')
      `);
      await connection.query(`
        INSERT INTO currency_settings_history (currency_code, currency_symbol, currency_name, changed_by) VALUES ('USD', '$', 'US Dollar', 'system')
      `);
      console.log('✅ Default currency settings inserted');
    }

    // Insert sample categories
    const [existingCategories] = await connection.query('SELECT COUNT(*) as count FROM categories');
    if (existingCategories[0].count === 0) {
      const sampleCategories = [
        { name: 'Beverages', description: 'Hot and cold drinks', sort_order: 1 },
        { name: 'Appetizers', description: 'Starters and snacks', sort_order: 2 },
        { name: 'Main Course', description: 'Primary dishes', sort_order: 3 },
        { name: 'Desserts', description: 'Sweet treats', sort_order: 4 },
        { name: 'Specials', description: 'Chef\'s special dishes', sort_order: 5 }
      ];

      for (const category of sampleCategories) {
        await connection.query(`
          INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)
        `, [category.name, category.description, category.sort_order]);
      }
      console.log('✅ Sample categories inserted');
    }

    // Insert default admin user
    const [existingUsers] = await connection.query('SELECT COUNT(*) as count FROM users');
    if (existingUsers[0].count === 0) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await connection.query(`
        INSERT INTO users (username, email, password, role) VALUES ('admin', 'admin@palmcafe.com', ?, 'admin')
      `, [hashedPassword]);
      console.log('✅ Default admin user created (username: admin, password: admin123)');
    }

    // Insert sample menu items
    const [existingMenuItems] = await connection.query('SELECT COUNT(*) as count FROM menu_items');
    if (existingMenuItems[0].count === 0) {
      // Get category IDs
      const [categories] = await connection.query('SELECT id, name FROM categories ORDER BY sort_order');
      const categoryMap = {};
      categories.forEach(cat => categoryMap[cat.name] = cat.id);

      const sampleMenuItems = [
        { name: 'Espresso', description: 'Single shot of espresso', price: 3.50, category: 'Beverages', sort_order: 1 },
        { name: 'Cappuccino', description: 'Espresso with steamed milk and foam', price: 4.50, category: 'Beverages', sort_order: 2 },
        { name: 'Latte', description: 'Espresso with steamed milk', price: 4.00, category: 'Beverages', sort_order: 3 },
        { name: 'Caesar Salad', description: 'Fresh romaine lettuce with Caesar dressing', price: 8.50, category: 'Appetizers', sort_order: 1 },
        { name: 'Bruschetta', description: 'Toasted bread with tomatoes and herbs', price: 6.50, category: 'Appetizers', sort_order: 2 },
        { name: 'Grilled Chicken', description: 'Grilled chicken breast with vegetables', price: 15.00, category: 'Main Course', sort_order: 1 },
        { name: 'Pasta Carbonara', description: 'Pasta with eggs, cheese, and bacon', price: 12.50, category: 'Main Course', sort_order: 2 },
        { name: 'Chocolate Cake', description: 'Rich chocolate layer cake', price: 6.00, category: 'Desserts', sort_order: 1 },
        { name: 'Tiramisu', description: 'Classic Italian dessert', price: 7.50, category: 'Desserts', sort_order: 2 },
        { name: 'Chef\'s Special', description: 'Daily special dish', price: 18.00, category: 'Specials', sort_order: 1 }
      ];

      for (const item of sampleMenuItems) {
        const categoryId = categoryMap[item.category];
        if (categoryId) {
          await connection.query(`
            INSERT INTO menu_items (name, description, price, category_id, sort_order) VALUES (?, ?, ?, ?, ?)
          `, [item.name, item.description, item.price, categoryId, item.sort_order]);
        }
      }
      console.log('✅ Sample menu items inserted');
    }

    console.log('🎉 Database setup completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   Database: ${databaseName}`);
    console.log(`   Tables created: 9`);
    console.log(`   Sample data: Categories, Menu Items, Tax Settings, Currency Settings`);
    console.log('\n🚀 You can now start the application!');

  } catch (error) {
    console.error('❌ Error during database setup:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run the setup
if (require.main === module) {
  createDatabase();
}

module.exports = { createDatabase }; 