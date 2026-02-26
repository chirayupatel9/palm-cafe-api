const { pool } = require('../config/database');

async function addMenuImagesMigration() {
  let connection;

  try {
    console.log('🔧 Starting menu images migration...');
    connection = await pool.getConnection();

    // Add image_url column to menu_items table
    await connection.execute(`
      ALTER TABLE menu_items
      ADD COLUMN image_url VARCHAR(255) NULL
    `);
    console.log('✅ Added image_url column to menu_items table');

    // Add show_menu_images column to cafe_settings table
    await connection.execute(`
      ALTER TABLE cafe_settings
      ADD COLUMN show_menu_images BOOLEAN DEFAULT TRUE
    `);
    console.log('✅ Added show_menu_images column to cafe_settings table');

    // Add show_menu_images column to cafe_settings_history table
    await connection.execute(`
      ALTER TABLE cafe_settings_history
      ADD COLUMN show_menu_images BOOLEAN DEFAULT TRUE
    `);
    console.log('✅ Added show_menu_images column to cafe_settings_history table');

    console.log('✅ Menu images migration completed successfully');
  } catch (error) {
    console.error('❌ Error during menu images migration:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

if (require.main === module) {
  addMenuImagesMigration()
    .then(() => { console.log('🎉 Menu images migration finished'); process.exit(0); })
    .catch((error) => { console.error('💥 Menu images migration failed:', error); process.exit(1); });
}
module.exports = addMenuImagesMigration; 