/**
 * Set test environment before any modules (e.g. database) are loaded.
 * Use TEST_DB_NAME or DB_NAME to point to test DB; do not use production DB.
 */
process.env.NODE_ENV = 'test';
if (!process.env.DB_NAME) {
  process.env.DB_NAME = process.env.TEST_DB_NAME || 'cafe_app_test';
}
