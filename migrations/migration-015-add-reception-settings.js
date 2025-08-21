const { pool } = require('../config/database');

async function addReceptionSettingsMigration() {
  let connection;

  try {
    console.log('🔧 Starting reception settings migration...');
    connection = await pool.getConnection();

    // Add reception visibility and permission columns to cafe_settings table
    await connection.execute(`
      ALTER TABLE cafe_settings
      ADD COLUMN reception_show_kitchen_tab BOOLEAN DEFAULT TRUE,
      ADD COLUMN reception_show_menu_tab BOOLEAN DEFAULT FALSE,
      ADD COLUMN reception_show_inventory_tab BOOLEAN DEFAULT FALSE,
      ADD COLUMN reception_show_history_tab BOOLEAN DEFAULT FALSE,
      ADD COLUMN reception_can_edit_orders BOOLEAN DEFAULT TRUE,
      ADD COLUMN reception_can_view_customers BOOLEAN DEFAULT TRUE,
      ADD COLUMN reception_can_view_payments BOOLEAN DEFAULT TRUE,
      ADD COLUMN reception_can_create_orders BOOLEAN DEFAULT TRUE
    `);
    console.log('✅ Added reception settings columns to cafe_settings table');

    // Add reception visibility and permission columns to cafe_settings_history table
    await connection.execute(`
      ALTER TABLE cafe_settings_history
      ADD COLUMN reception_show_kitchen_tab BOOLEAN DEFAULT TRUE,
      ADD COLUMN reception_show_menu_tab BOOLEAN DEFAULT FALSE,
      ADD COLUMN reception_show_inventory_tab BOOLEAN DEFAULT FALSE,
      ADD COLUMN reception_show_history_tab BOOLEAN DEFAULT FALSE,
      ADD COLUMN reception_can_edit_orders BOOLEAN DEFAULT TRUE,
      ADD COLUMN reception_can_view_customers BOOLEAN DEFAULT TRUE,
      ADD COLUMN reception_can_view_payments BOOLEAN DEFAULT TRUE,
      ADD COLUMN reception_can_create_orders BOOLEAN DEFAULT TRUE
    `);
    console.log('✅ Added reception settings columns to cafe_settings_history table');

    console.log('✅ Reception settings migration completed successfully');
  } catch (error) {
    console.error('❌ Error during reception settings migration:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

addReceptionSettingsMigration()
  .then(() => {
    console.log('🎉 Reception settings migration finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Reception settings migration failed:', error);
    process.exit(1);
  }); 