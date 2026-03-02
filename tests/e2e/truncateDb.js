/**
 * Truncate all application tables (except migrations) for E2E clean state.
 * Uses FOREIGN_KEY_CHECKS to allow truncation in any order.
 * @returns {Promise<void>}
 */
async function truncateDb() {
  const { pool } = require('../../config/database');
  const conn = await pool.getConnection();
  try {
    await conn.execute('SET FOREIGN_KEY_CHECKS = 0');
    const [rows] = await conn.execute(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME NOT IN ('migrations', 'features')
    `);
    for (const { TABLE_NAME: table } of rows) {
      await conn.execute(`TRUNCATE TABLE \`${table}\``);
    }
    await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    conn.release();
  }
}

module.exports = { truncateDb };
