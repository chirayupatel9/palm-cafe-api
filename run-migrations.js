const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_HOST = process.env.DB_HOST ;
const DB_USER = process.env.DB_USER ;
const DB_PASSWORD = process.env.DB_PASSWORD ;
const DB_NAME = process.env.DB_NAME ;

// Import all migrations
const migration001 = require('./migrations/migration-001-add-payment-method');
const migration002 = require('./migrations/migration-002-update-to-inr');
const migration003 = require('./migrations/migration-003-add-points-awarded');
const migration004 = require('./migrations/migration-004-add-payment-methods');

// List of migrations in order
const migrations = [
  { name: '001-add-payment-method', run: migration001.runMigration },
  { name: '002-update-to-inr', run: migration002.runMigration },
  { name: '003-add-points-awarded', run: migration003 },
  { name: '004-add-payment-methods', run: migration004 }
];

async function runMigrations() {
  let connection;
  
  try {
    console.log('🔌 Connecting to database for migrations...');
    connection = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME
    });
    console.log('✅ Connected to database');

    // Create migrations table if it doesn't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        migration_name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('🚀 Starting migrations...');

    for (const migration of migrations) {
      // Check if migration has already been run
      const [executed] = await connection.execute(
        'SELECT id FROM migrations WHERE migration_name = ?',
        [migration.name]
      );

      if (executed.length === 0) {
        console.log(`📝 Running migration: ${migration.name}`);
        
        try {
          await migration.run();
          
          // Mark migration as executed
          await connection.execute(
            'INSERT INTO migrations (migration_name) VALUES (?)',
            [migration.name]
          );
          
          console.log(`✅ Migration ${migration.name} completed successfully`);
        } catch (error) {
          console.error(`❌ Migration ${migration.name} failed:`, error);
          throw error;
        }
      } else {
        console.log(`ℹ️  Migration ${migration.name} already executed, skipping`);
      }
    }

    console.log('🎉 All migrations completed successfully!');

  } catch (error) {
    console.error('❌ Migration process failed:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run migrations if called directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('✅ Migration runner completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration runner failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigrations }; 