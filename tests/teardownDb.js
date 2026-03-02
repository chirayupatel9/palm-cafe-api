/**
 * GlobalTeardown: close MySQL pool so Jest can exit gracefully.
 * Does NOT drop the test database or tables - keeps test DB for next run.
 */
module.exports = async () => {
  try {
    const { pool } = require('../config/database');
    if (pool && typeof pool.end === 'function') {
      await pool.end();
    }
  } catch (err) {
    // Ignore if pool already closed or config not loaded
  }
};
