/**
 * Set test environment before any modules (e.g. database) are loaded.
 * Use TEST_DB_NAME or DB_NAME to point to test DB; do not use production DB.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
process.env.NODE_ENV = 'test';
// Force test DB when NODE_ENV=test (safety: never use production DB)
process.env.DB_NAME = process.env.TEST_DB_NAME || 'cafe_app_test';
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = process.env.TEST_JWT_SECRET || 'test-jwt-secret-do-not-use-in-production';
}
