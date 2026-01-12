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
console.log(dbConfig);
const databaseName = process.env.DB_NAME || 'cafe_app';

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

    // Customers table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        email VARCHAR(200) UNIQUE,
        phone VARCHAR(50) UNIQUE,
        address TEXT,
        date_of_birth DATE,
        loyalty_points INT DEFAULT 0,
        total_spent DECIMAL(10,2) DEFAULT 0,
        visit_count INT DEFAULT 0,
        first_visit_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_visit_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_phone (phone),
        INDEX idx_loyalty_points (loyalty_points)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Customers table created');

    // Menu items table - check if exists with wrong structure and fix it
    const [menuItemsTable] = await connection.query(`
      SELECT COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'id'
    `, [databaseName]);
    
    if (menuItemsTable.length > 0 && menuItemsTable[0].COLUMN_TYPE.includes('varchar')) {
      console.log('⚠️  menu_items table exists with VARCHAR id, dropping to recreate with INT...');
      await connection.query('DROP TABLE IF EXISTS order_items');
      await connection.query('DROP TABLE IF EXISTS menu_items');
    }
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        category_id INT,
        is_available BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        image_url VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Add image_url column if it doesn't exist (for existing tables)
    const [imageUrlColumn] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'image_url'
    `, [databaseName]);
    
    if (imageUrlColumn.length === 0) {
      await connection.query(`
        ALTER TABLE menu_items ADD COLUMN image_url VARCHAR(255) NULL
      `);
      console.log('✅ Added image_url column to menu_items');
    }
    
    console.log('✅ Menu items table created');

    // Orders table with all required columns
    await connection.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        customer_id INT,
        customer_name VARCHAR(200),
        customer_email VARCHAR(200),
        customer_phone VARCHAR(50),
        total_amount DECIMAL(10,2) NOT NULL,
        tax_amount DECIMAL(10,2) DEFAULT 0,
        tip_amount DECIMAL(10,2) DEFAULT 0,
        points_redeemed INT DEFAULT 0,
        points_awarded BOOLEAN DEFAULT FALSE,
        final_amount DECIMAL(10,2) NOT NULL,
        status ENUM('pending', 'preparing', 'ready', 'completed', 'cancelled') DEFAULT 'pending',
        payment_method ENUM('cash', 'card', 'upi', 'online') DEFAULT 'cash',
        split_payment BOOLEAN DEFAULT FALSE,
        split_payment_method VARCHAR(50) NULL,
        split_amount DECIMAL(10,2) DEFAULT 0.00,
        extra_charge DECIMAL(10,2) DEFAULT 0.00,
        extra_charge_note VARCHAR(255) NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
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
        order_id INT NULL,
        customer_name VARCHAR(200),
        customer_email VARCHAR(200),
        customer_phone VARCHAR(50),
        subtotal DECIMAL(10,2) NOT NULL,
        tax_amount DECIMAL(10,2) DEFAULT 0,
        tip_amount DECIMAL(10,2) DEFAULT 0,
        total_amount DECIMAL(10,2) NOT NULL,
        tax_rate DECIMAL(5,2) DEFAULT 0,
        tax_name VARCHAR(100) DEFAULT 'Tax',
        payment_method ENUM('cash', 'card', 'upi', 'online') DEFAULT 'cash',
        invoice_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Invoices table created');

    // Invoice items table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
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
    console.log('✅ Invoice items table created');

    // Tax settings table with all required columns
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tax_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tax_name VARCHAR(100) NOT NULL DEFAULT 'Sales Tax',
        tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        is_active BOOLEAN DEFAULT TRUE,
        show_tax_in_menu BOOLEAN DEFAULT TRUE,
        include_tax BOOLEAN DEFAULT TRUE,
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
        currency_code VARCHAR(3) NOT NULL DEFAULT 'INR',
        currency_symbol VARCHAR(10) NOT NULL DEFAULT '₹',
        currency_name VARCHAR(100) NOT NULL DEFAULT 'Indian Rupee',
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

    // Cafe settings table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS cafe_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_name VARCHAR(200) NOT NULL DEFAULT 'Our Cafe',
        logo_url VARCHAR(500) DEFAULT '/images/palm-cafe-logo.png',
        address TEXT,
        phone VARCHAR(50),
        email VARCHAR(200),
        website VARCHAR(200),
        opening_hours TEXT,
        description TEXT,
        show_kitchen_tab BOOLEAN DEFAULT TRUE,
        show_customers_tab BOOLEAN DEFAULT TRUE,
        show_payment_methods_tab BOOLEAN DEFAULT TRUE,
        show_menu_tab BOOLEAN DEFAULT TRUE,
        show_inventory_tab BOOLEAN DEFAULT TRUE,
        show_history_tab BOOLEAN DEFAULT TRUE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Cafe settings table created');

    // Cafe settings history table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS cafe_settings_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_name VARCHAR(200) NOT NULL,
        logo_url VARCHAR(500),
        address TEXT,
        phone VARCHAR(50),
        email VARCHAR(200),
        website VARCHAR(200),
        opening_hours TEXT,
        description TEXT,
        show_kitchen_tab BOOLEAN DEFAULT TRUE,
        show_customers_tab BOOLEAN DEFAULT TRUE,
        show_payment_methods_tab BOOLEAN DEFAULT TRUE,
        show_menu_tab BOOLEAN DEFAULT TRUE,
        show_inventory_tab BOOLEAN DEFAULT TRUE,
        show_history_tab BOOLEAN DEFAULT TRUE,
        changed_by VARCHAR(100) DEFAULT 'admin',
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Cafe settings history table created');

    // Inventory table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS inventory (
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
    console.log('✅ Inventory table created');

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

    // Payment methods table
    await connection.query(`
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

    console.log('✅ All tables created successfully');

    // Insert initial data
    console.log('📝 Inserting initial data...');

    // Insert default tax settings
    const [existingTax] = await connection.query('SELECT COUNT(*) as count FROM tax_settings');
    if (existingTax[0].count === 0) {
      await connection.query(`
        INSERT INTO tax_settings (tax_name, tax_rate, show_tax_in_menu, include_tax) VALUES ('Sales Tax', 8.50, TRUE, TRUE)
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
        INSERT INTO currency_settings (currency_code, currency_symbol, currency_name) VALUES ('INR', '₹', 'Indian Rupee')
      `);
      await connection.query(`
        INSERT INTO currency_settings_history (currency_code, currency_symbol, currency_name, changed_by) VALUES ('INR', '₹', 'Indian Rupee', 'system')
      `);
      console.log('✅ Default currency settings inserted');
    }

    // Insert default cafe settings
    const [existingCafeSettings] = await connection.query('SELECT COUNT(*) as count FROM cafe_settings');
    if (existingCafeSettings[0].count === 0) {
      await connection.query(`
        INSERT INTO cafe_settings (cafe_name, logo_url, address, phone, email, website, opening_hours, description, show_kitchen_tab, show_customers_tab, show_payment_methods_tab, show_menu_tab, show_inventory_tab, show_history_tab) 
        VALUES ('Our Cafe', '/images/palm-cafe-logo.png', '123 Main Street, City', '+91 98765 43210', 'info@ourcafe.com', 'https://ourcafe.com', 'Mon-Sun: 8:00 AM - 10:00 PM', 'Welcome to Our Cafe - Your perfect dining destination', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
      `);
      await connection.query(`
        INSERT INTO cafe_settings_history (cafe_name, logo_url, address, phone, email, website, opening_hours, description, show_kitchen_tab, show_customers_tab, show_payment_methods_tab, show_menu_tab, show_inventory_tab, show_history_tab, changed_by) 
        VALUES ('Our Cafe', '/images/palm-cafe-logo.png', '123 Main Street, City', '+91 98765 43210', 'info@ourcafe.com', 'https://ourcafe.com', 'Mon-Sun: 8:00 AM - 10:00 PM', 'Welcome to Our Cafe - Your perfect dining destination', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'system')
      `);
      console.log('✅ Default cafe settings inserted');
    }

    // Insert default payment methods
    const [existingPaymentMethods] = await connection.query('SELECT COUNT(*) as count FROM payment_methods');
    if (existingPaymentMethods[0].count === 0) {
      const defaultPaymentMethods = [
        { name: 'Cash', code: 'cash', description: 'Pay with cash', icon: '💵', display_order: 1 },
        { name: 'UPI', code: 'upi', description: 'Pay using UPI', icon: '📱', display_order: 2 },
        { name: 'Card', code: 'card', description: 'Pay with credit/debit card', icon: '💳', display_order: 3 },
        { name: 'Online', code: 'online', description: 'Pay online', icon: '🌐', display_order: 4 }
      ];

      for (const method of defaultPaymentMethods) {
        await connection.query(`
          INSERT INTO payment_methods (name, code, description, icon, display_order, is_active) 
          VALUES (?, ?, ?, ?, ?, ?)
        `, [method.name, method.code, method.description, method.icon, method.display_order, true]);
      }
      console.log('✅ Default payment methods inserted');
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
        INSERT INTO users (username, email, password, role) VALUES ('admin', 'admin@cafe.com', ?, 'admin')
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
        { name: 'Espresso', description: 'Single shot of espresso', price: 120.00, category: 'Beverages', sort_order: 1 },
        { name: 'Cappuccino', description: 'Espresso with steamed milk and foam', price: 150.00, category: 'Beverages', sort_order: 2 },
        { name: 'Latte', description: 'Espresso with steamed milk', price: 140.00, category: 'Beverages', sort_order: 3 },
        { name: 'Caesar Salad', description: 'Fresh romaine lettuce with Caesar dressing', price: 280.00, category: 'Appetizers', sort_order: 1 },
        { name: 'Bruschetta', description: 'Toasted bread with tomatoes and herbs', price: 220.00, category: 'Appetizers', sort_order: 2 },
        { name: 'Grilled Chicken', description: 'Grilled chicken breast with vegetables', price: 450.00, category: 'Main Course', sort_order: 1 },
        { name: 'Pasta Carbonara', description: 'Pasta with eggs, cheese, and bacon', price: 380.00, category: 'Main Course', sort_order: 2 },
        { name: 'Chocolate Cake', description: 'Rich chocolate layer cake', price: 200.00, category: 'Desserts', sort_order: 1 },
        { name: 'Tiramisu', description: 'Classic Italian dessert', price: 250.00, category: 'Desserts', sort_order: 2 },
        { name: 'Chef\'s Special', description: 'Daily special dish', price: 550.00, category: 'Specials', sort_order: 1 }
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
    console.log(`   Tables created: 11`);
    console.log(`   Sample data: Categories, Menu Items, Tax Settings, Currency Settings, Payment Methods`);
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