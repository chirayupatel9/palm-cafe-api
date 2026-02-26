/**
 * Add composite indexes for common query patterns. Indexes only; no table structure changes.
 * - orders (cafe_id, status, created_at)
 * - invoices (cafe_id, created_at)
 * - customers (cafe_id, created_at)
 */
const { pool } = require('../config/database');

const INDEXES = [
  { table: 'orders', name: 'idx_orders_cafe_status_created', columns: ['cafe_id', 'status', 'created_at'] },
  { table: 'invoices', name: 'idx_invoices_cafe_created', columns: ['cafe_id', 'created_at'] },
  { table: 'customers', name: 'idx_customers_cafe_created', columns: ['cafe_id', 'created_at'] }
];

async function addPerformanceIndexesMigration() {
  let connection;

  try {
    console.log('Adding performance indexes...');
    connection = await pool.getConnection();

    for (const idx of INDEXES) {
      const [existing] = await connection.execute(`
        SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
      `, [idx.table, idx.name]);

      if (existing.length > 0) {
        console.log(`Index ${idx.name} already exists on ${idx.table}`);
        continue;
      }

      const colList = idx.columns.join(', ');
      await connection.execute(`
        ALTER TABLE \`${idx.table}\` ADD INDEX \`${idx.name}\` (${colList})
      `);
      console.log(`Added ${idx.name} on ${idx.table}`);
    }

    console.log('Performance indexes migration completed successfully');
  } catch (error) {
    console.error('Error during performance indexes migration:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function down() {
  let connection;
  try {
    connection = await pool.getConnection();
    for (const idx of INDEXES) {
      try {
        await connection.execute(`
          ALTER TABLE \`${idx.table}\` DROP INDEX \`${idx.name}\`
        `);
        console.log(`Dropped ${idx.name} from ${idx.table}`);
      } catch (err) {
        if (err.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw err;
        console.log(`Index ${idx.name} did not exist on ${idx.table}`);
      }
    }
  } catch (error) {
    console.error('Error during performance indexes rollback:', error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

if (require.main === module) {
  addPerformanceIndexesMigration()
    .then(() => { console.log('Performance indexes migration finished'); process.exit(0); })
    .catch((error) => { console.error('Performance indexes migration failed:', error); process.exit(1); });
}

module.exports = { runMigration: addPerformanceIndexesMigration, addPerformanceIndexesMigration, down };
