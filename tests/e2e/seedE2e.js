/**
 * Seed minimal data for E2E: one default cafe and one superadmin user.
 * Call after truncateDb() so tests can login and create tenants via API.
 */
const bcrypt = require('bcryptjs');

async function seedE2e() {
  const { pool } = require('../../config/database');
  const conn = await pool.getConnection();
  try {
    const [existing] = await conn.execute('SELECT id FROM cafes WHERE slug = ? LIMIT 1', ['default']);
    if (existing.length === 0) {
      const [cafeCols] = await conn.execute(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cafes'
      `);
      const cafeColumns = cafeCols.map((r) => r.COLUMN_NAME);

      const hasSubscription = cafeColumns.includes('subscription_plan') && cafeColumns.includes('subscription_status');
      const hasOnboarding = cafeColumns.includes('is_onboarded');

      let cafeFields = 'slug, name, description, is_active';
      let cafePlaceholders = '?, ?, ?, ?';
      const cafeValues = ['default', 'Default Cafe', 'E2E default', true];

      if (hasSubscription) {
        cafeFields += ', subscription_plan, subscription_status';
        cafePlaceholders += ', ?, ?';
        cafeValues.push('PRO', 'active');
      }
      if (hasOnboarding) {
        cafeFields += ', is_onboarded';
        cafePlaceholders += ', ?';
        cafeValues.push(true);
      }

      await conn.execute(
        `INSERT INTO cafes (${cafeFields}) VALUES (${cafePlaceholders})`,
        cafeValues
      );
    }

    const [userCols] = await conn.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('cafe_id', 'role')
    `);
    const userColNames = userCols.map((r) => r.COLUMN_NAME);
    const hasCafeId = userColNames.includes('cafe_id');
    const [roleType] = await conn.execute(`
      SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'
    `);
    const roleSupportsSuperadmin = roleType.length > 0 && String(roleType[0].COLUMN_TYPE).includes('superadmin');

    const [superExists] = await conn.execute('SELECT id FROM users WHERE email = ?', ['e2e-superadmin@test.com']);
    if (superExists.length === 0) {
      const hashedPassword = await bcrypt.hash('superadmin123', 10);
      if (hasCafeId && roleSupportsSuperadmin) {
        await conn.execute(
          `INSERT INTO users (username, email, password, role, cafe_id, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NOW(), NOW())`,
          ['e2e-superadmin', 'e2e-superadmin@test.com', hashedPassword, 'superadmin']
        );
      } else if (roleSupportsSuperadmin) {
        await conn.execute(
          `INSERT INTO users (username, email, password, role, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`,
          ['e2e-superadmin', 'e2e-superadmin@test.com', hashedPassword, 'superadmin']
        );
      } else {
        await conn.execute(
          `INSERT INTO users (username, email, password, role, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`,
          ['e2e-superadmin', 'e2e-superadmin@test.com', hashedPassword, 'admin']
        );
      }
    }

    const [adminExists] = await conn.execute('SELECT id FROM users WHERE email = ?', ['e2e-admin@test.com']);
    if (adminExists.length === 0 && hasCafeId) {
      const adminPassword = await bcrypt.hash('admin123', 10);
      await conn.execute(
        `INSERT INTO users (username, email, password, role, cafe_id, created_at, updated_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
        ['e2e-admin', 'e2e-admin@test.com', adminPassword, 'admin']
      );
    }
  } finally {
    conn.release();
  }
}

module.exports = { seedE2e };
