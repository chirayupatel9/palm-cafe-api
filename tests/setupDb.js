/**
 * GlobalSetup: ensure test database exists, full schema from setup-database, then migrations.
 * Runs in a separate process; set env here so this process uses the test DB.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || process.env.DB_NAME || 'cafe_app_test';

const mysql = require('mysql2/promise');
const { testConnection } = require('../config/database');
const { createDatabase } = require('../setup-database');
const { runMigrations } = require('../run-migrations');

const testDbName = process.env.DB_NAME;

async function ensureTestDatabase() {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT || '3306', 10)
  };
  let conn;
  try {
    conn = await mysql.createConnection(config);
    await conn.execute(`CREATE DATABASE IF NOT EXISTS \`${testDbName.replace(/`/g, '``')}\``);
  } finally {
    if (conn) await conn.end();
  }
}

async function markMigrationsAsRun(throughName) {
  const { pool } = require('../config/database');
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const runOrder = [
    '001-add-payment-method', '002-update-to-inr', '003-add-points-awarded',
    '004-add-payment-methods', '005-add-include-tax-toggle', '006-add-split-payment',
    '007-add-extra-charge', '008-add-cafe-settings', '009-add-tab-visibility', '010-add-color-scheme',
    '011-add-surface-colors', '012-add-menu-images', '013-add-chef-visibility', '014-add-chef-reception-roles',
    '015-add-reception-settings', '016-add-superadmin', '017-add-printer-settings'
  ];
  const throughIndex = runOrder.indexOf(throughName);
  if (throughIndex === -1) return;
  const toMark = runOrder.slice(0, throughIndex + 1);
  for (const name of toMark) {
    await pool.execute(
      'INSERT IGNORE INTO migrations (migration_name) VALUES (?)',
      [name]
    );
  }
}

module.exports = async () => {
  await ensureTestDatabase();
  const ok = await testConnection();
  if (!ok) {
    throw new Error('Test DB connection failed. Check DB_HOST, DB_USER, DB_PASSWORD and that MySQL is running.');
  }
  await createDatabase();
  await markMigrationsAsRun('017-add-printer-settings');
  await runMigrations();
  await ensureOrdersTableNumberColumn();
  await ensureTestCafeAndAdmin();
  await ensureSuperadminUser();
}

async function ensureTestCafeAndAdmin() {
  try {
    const { pool } = require('../config/database');
    const [cafeCols] = await pool.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cafes'
      AND COLUMN_NAME IN ('subscription_plan', 'subscription_status')
    `);
    if (cafeCols.length >= 2) {
      await pool.execute(`
        UPDATE cafes SET subscription_plan = 'PRO', subscription_status = 'active'
        WHERE id = 1 OR slug = 'default' LIMIT 1
      `).catch(() => {});
    }
    const [userCols] = await pool.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'cafe_id'
    `);
    if (userCols.length > 0) {
      await pool.execute(`
        UPDATE users SET cafe_id = 1 WHERE email = 'admin@cafe.com' AND (cafe_id IS NULL OR cafe_id = 0)
      `).catch(() => {});
    }
  } catch (err) {
    // Ignore
  }
}

async function ensureSuperadminUser() {
  try {
    const { pool } = require('../config/database');
    const bcrypt = require('bcryptjs');
    const email = 'superadmin-test@cafe.com';
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return;
    const [cols] = await pool.execute(`
      SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'
    `);
    if (cols.length > 0 && cols[0].COLUMN_TYPE && !String(cols[0].COLUMN_TYPE).includes('superadmin')) {
      await pool.execute(`
        ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'user', 'chef', 'reception', 'superadmin') DEFAULT 'user'
      `);
    }
    const hash = await bcrypt.hash('admin123', 10);
    await pool.execute(
      'INSERT INTO users (username, email, password, role, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      ['superadmin-test', email, hash, 'superadmin']
    );
  } catch (err) {
    // Ignore if table structure or insert fails
  }
}

async function ensureOrdersTableNumberColumn() {
  const { pool } = require('../config/database');
  const [cols] = await pool.execute(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'table_number'
  `);
  if (cols.length === 0) {
    await pool.execute(`
      ALTER TABLE orders ADD COLUMN table_number VARCHAR(20) NULL AFTER customer_phone
    `).catch(() => {});
    await pool.execute(`
      CREATE INDEX idx_table_number ON orders(table_number)
    `).catch(() => {});
  }
}
