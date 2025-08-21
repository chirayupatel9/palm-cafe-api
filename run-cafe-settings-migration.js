const { migrateCafeSettings } = require('./migrations/migration-008-add-cafe-settings');

console.log('🚀 Starting cafe settings migration...');

migrateCafeSettings()
  .then(() => {
    console.log('✅ Cafe settings migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Cafe settings migration failed:', error);
    process.exit(1);
  }); 