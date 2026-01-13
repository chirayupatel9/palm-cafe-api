#!/usr/bin/env node

/**
 * Helper script to run the onboarding migration
 * Usage: node run-onboarding-migration.js
 */

const migrateCafeOnboarding = require('./migrations/migration-023-add-cafe-onboarding');

console.log('🚀 Running cafe onboarding migration...\n');

migrateCafeOnboarding()
  .then(() => {
    console.log('\n✅ Migration completed successfully!');
    console.log('\nYou can now use the onboarding feature.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nPlease check your database connection and try again.');
    process.exit(1);
  });
