/**
 * Add UNIQUE(cafe_id, name) to categories so category names are unique per cafe.
 * Rollback: drop the unique index (see down()).
 */
const { pool } = require('../config/database');

/**
 * Add a unique constraint on the categories table for the combination of `cafe_id` and `name` if it does not already exist.
 *
 * Checks for an existing index named `unique_cafe_category_name` and creates that unique index when absent.
 * @throws {Error} If the migration fails.
 */
async function addCategoriesUniqueMigration() {
  let connection;

  try {
    console.log('Adding unique (cafe_id, name) to categories...');
    connection = await pool.getConnection();

    const [existing] = await connection.execute(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND INDEX_NAME = 'unique_cafe_category_name'
    `);

    if (existing.length > 0) {
      console.log('Unique index unique_cafe_category_name already exists on categories');
      return;
    }

    await connection.execute(`
      ALTER TABLE categories ADD UNIQUE KEY unique_cafe_category_name (cafe_id, name)
    `);
    console.log('Added unique_cafe_category_name to categories');

    console.log('Categories unique migration completed successfully');
  } catch (error) {
    console.error('Error during categories unique migration:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Remove the unique index `unique_cafe_category_name` from the `categories` table.
 *
 * Acquires a database connection to execute the ALTER TABLE DROP INDEX statement and
 * releases the connection when finished. Rethrows any error encountered during the operation.
 *
 * @throws {Error} If the DROP INDEX operation or database interaction fails.
 */
async function down() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.execute(`
      ALTER TABLE categories DROP INDEX unique_cafe_category_name
    `);
    console.log('Dropped unique_cafe_category_name from categories');
  } catch (error) {
    console.error('Error during categories unique rollback:', error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

if (require.main === module) {
  addCategoriesUniqueMigration()
    .then(() => { console.log('Categories unique migration finished'); process.exit(0); })
    .catch((error) => { console.error('Categories unique migration failed:', error); process.exit(1); });
}

module.exports = { runMigration: addCategoriesUniqueMigration, addCategoriesUniqueMigration, down };
