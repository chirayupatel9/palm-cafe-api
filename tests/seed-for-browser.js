/**
 * Truncate and seed E2E data for browser E2E (Playwright).
 * Run from API dir with NODE_ENV=test and DB_NAME=cafe_app_test.
 * Usage: node tests/seed-for-browser.js
 */
require('./setupEnv.js');
const { truncateDb } = require('./e2e/truncateDb');
const { seedE2e } = require('./e2e/seedE2e');

async function main() {
  await truncateDb();
  await seedE2e();
  console.log('Seed for browser E2E done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
