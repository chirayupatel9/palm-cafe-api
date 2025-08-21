const mysql = require('mysql2/promise');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cafe_app',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00', // Use UTC timezone
  charset: 'utf8mb4'
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Initialize database tables
const initializeDatabase = async () => {
  try {
    const connection = await pool.getConnection();
    
    // Create menu_items table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Create invoices table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS invoices (
        invoice_number VARCHAR(20) PRIMARY KEY,
        customer_name VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(50),
        total DECIMAL(10,2) NOT NULL,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create invoice_items table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_number VARCHAR(50) NOT NULL,
        menu_item_id VARCHAR(36) NOT NULL,
        item_name VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        quantity INT NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (invoice_number) REFERENCES invoices(invoice_number) ON DELETE CASCADE
      )
    `);

    // Create users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        email VARCHAR(200) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'user') DEFAULT 'user',
        last_login TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Insert default menu items if table is empty
    const [menuRows] = await connection.execute('SELECT COUNT(*) as count FROM menu_items');
    if (menuRows[0].count === 0) {
      const defaultItems = [
        {
          id: '1',
          name: 'Espresso',
          description: 'Single shot of espresso',
          price: 3.50
        },
        {
          id: '2',
          name: 'Cappuccino',
          description: 'Espresso with steamed milk and foam',
          price: 4.50
        },
        {
          id: '3',
          name: 'Latte',
          description: 'Espresso with steamed milk',
          price: 4.75
        },
        {
          id: '4',
          name: 'Americano',
          description: 'Espresso with hot water',
          price: 3.75
        },
        {
          id: '5',
          name: 'Croissant',
          description: 'Buttery French pastry',
          price: 3.25
        },
        {
          id: '6',
          name: 'Chocolate Cake',
          description: 'Rich chocolate layer cake',
          price: 5.50
        }
      ];

      for (const item of defaultItems) {
        await connection.execute(
          'INSERT INTO menu_items (id, name, description, price) VALUES (?, ?, ?, ?)',
          [item.id, item.name, item.description, item.price]
        );
      }
      console.log('Default menu items inserted');
    }

    // Insert default admin user if users table is empty
    const [userRows] = await connection.execute('SELECT COUNT(*) as count FROM users');
    if (userRows[0].count === 0) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await connection.execute(
        'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
        ['admin', 'admin@cafe.com', hashedPassword, 'admin']
      );
      console.log('Default admin user created (username: admin, password: admin123)');
    }

    connection.release();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

// Test database connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Database connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
};

module.exports = {
  pool,
  initializeDatabase,
  testConnection
}; 