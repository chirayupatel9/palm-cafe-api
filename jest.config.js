module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js', '**/test/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  globalSetup: '<rootDir>/tests/setupDb.js',
  globalTeardown: '<rootDir>/tests/teardownDb.js',
  testTimeout: 15000,
  collectCoverageFrom: [
    'routes/**/*.js',
    'middleware/**/*.js',
    'models/**/*.js',
    'lib/**/*.js',
    'services/**/*.js',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 80,
      statements: 80
    }
  },
  forceExit: true,
  reporters: [
    'default',
    '<rootDir>/tests/reporters/testReportReporter.js'
  ]
};
