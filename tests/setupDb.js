/**
 * GlobalSetup: ensure test database is initialized and migrated before any tests.
 * Runs in a separate process; set env here so this process uses the test DB.
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || process.env.DB_NAME || 'cafe_app_test';

const { testConnection, initializeDatabase } = require('../config/database');
const { runMigrations } = require('../run-migrations');

module.exports = async () => {
  const ok = await testConnection();
  if (!ok) {
    throw new Error('Test DB connection failed. Create the test database and run with DB_NAME=cafe_app_test (or TEST_DB_NAME).');
  }
  await initializeDatabase();
  await runMigrations();
};
