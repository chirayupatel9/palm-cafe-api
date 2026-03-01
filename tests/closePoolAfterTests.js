/**
 * Close MySQL pool after all tests in this worker so Jest can exit gracefully.
 */
afterAll(async () => {
  try {
    const { pool } = require('../config/database');
    if (pool && typeof pool.end === 'function') {
      await pool.end();
    }
  } catch (err) {
    // Ignore
  }
});
