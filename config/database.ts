import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import logger from './logger';
import dotenv from 'dotenv';
dotenv.config();

interface DbConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
  waitForConnections: boolean;
  connectionLimit: number;
  queueLimit: number;
  timezone: string;
  charset: string;
}

const dbConfig: DbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'palm_db_ts',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
  charset: 'utf8mb4'
};

export const pool = mysql.createPool(dbConfig);

interface DefaultMenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
}

export const initializeDatabase = async (): Promise<void> => {
  const connection = await pool.getConnection();
  try {
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

    const [menuRows] = await connection.execute('SELECT COUNT(*) as count FROM menu_items') as [mysql.RowDataPacket[], mysql.FieldPacket[]];
    const menuCount = (menuRows[0] as { count: number }).count;
    if (menuCount === 0) {
      const defaultItems: DefaultMenuItem[] = [
        { id: '1', name: 'Espresso', description: 'Single shot of espresso', price: 3.50 },
        { id: '2', name: 'Cappuccino', description: 'Espresso with steamed milk and foam', price: 4.50 },
        { id: '3', name: 'Latte', description: 'Espresso with steamed milk', price: 4.75 },
        { id: '4', name: 'Americano', description: 'Espresso with hot water', price: 3.75 },
        { id: '5', name: 'Croissant', description: 'Buttery French pastry', price: 3.25 },
        { id: '6', name: 'Chocolate Cake', description: 'Rich chocolate layer cake', price: 5.50 }
      ];
      for (const item of defaultItems) {
        await connection.execute(
          'INSERT INTO menu_items (id, name, description, price) VALUES (?, ?, ?, ?)',
          [item.id, item.name, item.description, item.price]
        );
      }
      logger.info('Default menu items inserted');
    }

    const [userRows] = await connection.execute('SELECT COUNT(*) as count FROM users') as [mysql.RowDataPacket[], mysql.FieldPacket[]];
    const userCount = (userRows[0] as { count: number }).count;
    if (userCount === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await connection.execute(
        'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
        ['admin', 'admin@cafe.com', hashedPassword, 'admin']
      );
      logger.info('Default admin user created');
    }
    logger.info('Database initialized successfully');
  } catch (error) {
    logger.error('Error initializing database', { message: (error as Error).message });
    throw error;
  } finally {
    connection.release();
  }
};

export const testConnection = async (): Promise<boolean> => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    return true;
  } catch (error) {
    logger.error('Database connection failed', { message: (error as Error).message });
    return false;
  }
};
