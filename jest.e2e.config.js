/**
 * Jest config for E2E regression suite.
 * Real HTTP (supertest) and real DB; no mocks.
 * Run with: npm run test:e2e
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/e2e/**/*.e2e.test.js'],
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/e2e/setup.js'],
  globalSetup: '<rootDir>/tests/setupDb.js',
  globalTeardown: '<rootDir>/tests/teardownDb.js',
  testTimeout: 30000,
  verbose: true,
  maxWorkers: 1
};
