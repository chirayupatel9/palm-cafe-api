/**
 * Standalone script to truncate and seed E2E data for browser tests.
 * Run from API dir with NODE_ENV=test and DB_NAME=cafe_app_test (or TEST_DB_NAME).
 * Usage: node tests/e2e/seedForBrowser.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || process.env.DB_NAME || 'cafe_app_test';

const { truncateDb } = require('./truncateDb');
const { seedE2e } = require('./seedE2e');
const { seedBrowserMenu } = require('./seedBrowserMenu');
const { pool } = require('../../config/database');

async function main() {
  await truncateDb();
  await seedE2e();
  await seedBrowserMenu();
  console.log('E2E seed done.');
  if (pool && typeof pool.end === 'function') {
    await pool.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
