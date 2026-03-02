/**
 * E2E setup: close DB pool after all tests in this worker so Jest exits without open handles.
 */
afterAll(async () => {
  try {
    const { pool } = require('../../config/database');
    if (pool && typeof pool.end === 'function') {
      await pool.end();
    }
  } catch (err) {
    // Ignore
  }
});
