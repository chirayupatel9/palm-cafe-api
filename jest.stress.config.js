/**
 * Jest config for stress tests only. Does not ignore tests/stress/.
 * Run with: npm run test:stress
 */
const base = require('./jest.config.js');

module.exports = {
  ...base,
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/'],
  testTimeout: 45000
};
