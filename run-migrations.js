const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'cafe_app';
const DB_PORT = process.env.DB_PORT || 3306;

/**
 * Resolve a migration module to its executable run function.
 *
 * Searches common migration export names and returns the first matching callable.
 * @param {*} mod - The migration module or function export to resolve.
 * @returns {Function|undefined} The migration's run function if found, `undefined` otherwise.
 */
function getMigrationRun(mod) {
  if (typeof mod === 'function') return mod;
  return mod.runMigration || mod.run || mod.addPerformanceIndexesMigration || mod.addCategoriesUniqueMigration || mod.migrateCafeSettings || mod.migrateTabVisibility ||
    mod.migrateColorScheme || mod.addSurfaceColorsMigration || mod.addMenuImagesMigration ||
    mod.addChefVisibilityMigration || mod.addChefReceptionRolesMigration ||
    mod.addReceptionSettingsMigration || mod.addSuperadminMigration ||
    mod.addPrinterSettingsMigration || mod.addTableNumberField || mod.addFeaturedPriorityMigration ||
    mod.addCafeBrandingImagesMigration || mod.addPromoBannersMigration || mod.addCategoriesUniqueMigration || mod.addExtraChargeFields ||
    mod.addIncludeTaxToggle || mod.addPaymentMethodsAndTaxSettings || mod.addPointsAwardedField;
}

/**
 * All migrations in order (001 through 028). Names must match migration file names.
 */
const MIGRATION_ORDER = [
  '001-add-payment-method',
  '002-update-to-inr',
  '003-add-points-awarded',
  '004-add-payment-methods',
  '005-add-include-tax-toggle',
  '006-add-split-payment',
  '007-add-extra-charge',
  '008-add-cafe-settings',
  '009-add-tab-visibility',
  '010-add-color-scheme',
  '011-add-surface-colors',
  '012-add-menu-images',
  '013-add-chef-visibility',
  '014-add-chef-reception-roles',
  '015-add-reception-settings',
  '016-add-superadmin',
  '017-add-printer-settings',
  '018-add-table-number',
  '019-add-multi-cafe-support',
  '020-add-subscription-support',
  '021-add-feature-flags-system',
  '022-add-subscription-audit-log',
  '023-add-cafe-onboarding',
  '024-add-cafe-daily-metrics',
  '025-add-featured-priority',
  '026-add-cafe-branding-images',
  '027-add-impersonation-audit-log',
  '028-add-promo-banners',
  '029-add-categories-unique',
  '030-add-performance-indexes'
];

/**
 * Apply ordered migration scripts to the configured MySQL database and record each successful execution.
 *
 * Connects to the database using environment-configured connection values, ensures a `migrations` tracking
 * table exists, and then iterates through MIGRATION_ORDER. For each migration it skips ones already recorded,
 * loads the migration file if present, resolves its run function, executes it, and inserts a record on success.
 * The database connection is closed when processing finishes or on error.
 *
 * @throws {Error} If a migration module does not expose a runnable function.
 * @throws {Error} If any migration or database operation fails; the original error is rethrown.
 */
async function runMigrations() {
  let connection;

  try {
    console.log('Connecting to database for migrations...');
    connection = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      port: DB_PORT
    });
    console.log('Connected to database');

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        migration_name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    for (const name of MIGRATION_ORDER) {
      const [executed] = await connection.execute(
        'SELECT id FROM migrations WHERE migration_name = ?',
        [name]
      );

      if (executed.length > 0) {
        console.log('Skipping (already run):', name);
        continue;
      }

      const file = path.join(__dirname, 'migrations', `migration-${name}.js`);
      if (!fs.existsSync(file)) {
        console.warn('Migration file not found:', file);
        continue;
      }

      const mod = require(file);
      const run = getMigrationRun(mod);
      if (typeof run !== 'function') {
        console.error('No run function for migration:', name);
        throw new Error(`Migration ${name} has no run function`);
      }

      console.log('Running:', name);
      try {
        await run();
        await connection.execute('INSERT INTO migrations (migration_name) VALUES (?)', [name]);
        console.log('Completed:', name);
      } catch (err) {
        console.error('Migration failed:', name, err.message);
        throw err;
      }
    }

    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Migration process failed:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => { process.exit(0); })
    .catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { runMigrations };
