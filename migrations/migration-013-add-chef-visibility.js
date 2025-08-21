const { pool } = require('../config/database');

async function addChefVisibilityMigration() {
  let connection;

  try {
    console.log('🔧 Starting chef visibility migration...');
    connection = await pool.getConnection();

    // Add chef visibility and permission columns to cafe_settings table
    await connection.execute(`
      ALTER TABLE cafe_settings
      ADD COLUMN chef_show_kitchen_tab BOOLEAN DEFAULT TRUE,
      ADD COLUMN chef_show_menu_tab BOOLEAN DEFAULT FALSE,
      ADD COLUMN chef_show_inventory_tab BOOLEAN DEFAULT FALSE,
      ADD COLUMN chef_show_history_tab BOOLEAN DEFAULT FALSE,
      ADD COLUMN chef_can_edit_orders BOOLEAN DEFAULT TRUE,
      ADD COLUMN chef_can_view_customers BOOLEAN DEFAULT FALSE,
      ADD COLUMN chef_can_view_payments BOOLEAN DEFAULT FALSE
    `);
    console.log('✅ Added chef visibility columns to cafe_settings table');

    // Add chef visibility and permission columns to cafe_settings_history table
    await connection.execute(`
      ALTER TABLE cafe_settings_history
      ADD COLUMN chef_show_kitchen_tab BOOLEAN DEFAULT TRUE,
      ADD COLUMN chef_show_menu_tab BOOLEAN DEFAULT FALSE,
      ADD COLUMN chef_show_inventory_tab BOOLEAN DEFAULT FALSE,
      ADD COLUMN chef_show_history_tab BOOLEAN DEFAULT FALSE,
      ADD COLUMN chef_can_edit_orders BOOLEAN DEFAULT TRUE,
      ADD COLUMN chef_can_view_customers BOOLEAN DEFAULT FALSE,
      ADD COLUMN chef_can_view_payments BOOLEAN DEFAULT FALSE
    `);
    console.log('✅ Added chef visibility columns to cafe_settings_history table');

    console.log('✅ Chef visibility migration completed successfully');
  } catch (error) {
    console.error('❌ Error during chef visibility migration:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

addChefVisibilityMigration()
  .then(() => {
    console.log('🎉 Chef visibility migration finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Chef visibility migration failed:', error);
    process.exit(1);
  }); 