const { pool } = require('../config/database');

async function addSurfaceColorsMigration() {
  let connection;

  try {
    console.log('🔧 Starting surface colors migration...');
    connection = await pool.getConnection();

    // Add surface color columns to cafe_settings table
    await connection.execute(`
      ALTER TABLE cafe_settings
      ADD COLUMN light_surface_color VARCHAR(7) DEFAULT '#FFFFFF',
      ADD COLUMN dark_surface_color VARCHAR(7) DEFAULT '#1F2937'
    `);
    console.log('✅ Added surface color columns to cafe_settings table');

    // Add surface color columns to cafe_settings_history table
    await connection.execute(`
      ALTER TABLE cafe_settings_history
      ADD COLUMN light_surface_color VARCHAR(7) DEFAULT '#FFFFFF',
      ADD COLUMN dark_surface_color VARCHAR(7) DEFAULT '#1F2937'
    `);
    console.log('✅ Added surface color columns to cafe_settings_history table');

    console.log('✅ Surface colors migration completed successfully');
  } catch (error) {
    console.error('❌ Error during surface colors migration:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

if (require.main === module) {
  addSurfaceColorsMigration()
    .then(() => { console.log('🎉 Surface colors migration finished'); process.exit(0); })
    .catch((error) => { console.error('💥 Surface colors migration failed:', error); process.exit(1); });
}
module.exports = addSurfaceColorsMigration; 