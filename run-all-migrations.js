const { pool } = require('./config/database');

async function runAllMigrations() {
  let connection;

  try {
    console.log('🚀 Starting all migrations...');
    connection = await pool.getConnection();

    // Migration 011: Add surface colors
    console.log('\n📋 Running migration 011: Add surface colors...');
    await connection.execute(`
      ALTER TABLE cafe_settings
      ADD COLUMN light_surface_color VARCHAR(7) DEFAULT '#FFFFFF',
      ADD COLUMN dark_surface_color VARCHAR(7) DEFAULT '#1F2937'
    `);
    await connection.execute(`
      ALTER TABLE cafe_settings_history
      ADD COLUMN light_surface_color VARCHAR(7) DEFAULT '#FFFFFF',
      ADD COLUMN dark_surface_color VARCHAR(7) DEFAULT '#1F2937'
    `);
    console.log('✅ Migration 011 completed');

    // Migration 012: Add menu images
    console.log('\n📋 Running migration 012: Add menu images...');
    await connection.execute(`
      ALTER TABLE menu_items
      ADD COLUMN image_url VARCHAR(255) NULL
    `);
    await connection.execute(`
      ALTER TABLE cafe_settings
      ADD COLUMN show_menu_images BOOLEAN DEFAULT TRUE
    `);
    await connection.execute(`
      ALTER TABLE cafe_settings_history
      ADD COLUMN show_menu_images BOOLEAN DEFAULT TRUE
    `);
    console.log('✅ Migration 012 completed');

    // Migration 013: Add chef visibility
    console.log('\n📋 Running migration 013: Add chef visibility...');
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
    console.log('✅ Migration 013 completed');

    // Migration 014: Add chef and reception roles
    console.log('\n📋 Running migration 014: Add chef and reception roles...');
    await connection.execute(`
      ALTER TABLE users 
      MODIFY COLUMN role ENUM('admin', 'user', 'chef', 'reception') DEFAULT 'user'
    `);
    console.log('✅ Migration 014 completed');

    // Migration 015: Add reception settings
    console.log('\n📋 Running migration 015: Add reception settings...');
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
    console.log('✅ Migration 015 completed');

    // Migration 016: Add superadmin
    console.log('\n📋 Running migration 016: Add superadmin...');
    await connection.execute(`
      ALTER TABLE users 
      MODIFY COLUMN role ENUM('admin', 'user', 'chef', 'reception', 'superadmin') DEFAULT 'user'
    `);
    await connection.execute(`
      ALTER TABLE cafe_settings
      ADD COLUMN admin_can_access_settings BOOLEAN DEFAULT FALSE,
      ADD COLUMN admin_can_manage_users BOOLEAN DEFAULT FALSE,
      ADD COLUMN admin_can_view_reports BOOLEAN DEFAULT TRUE,
      ADD COLUMN admin_can_manage_inventory BOOLEAN DEFAULT TRUE,
      ADD COLUMN admin_can_manage_menu BOOLEAN DEFAULT TRUE
    `);
    await connection.execute(`
      ALTER TABLE cafe_settings_history
      ADD COLUMN admin_can_access_settings BOOLEAN DEFAULT FALSE,
      ADD COLUMN admin_can_manage_users BOOLEAN DEFAULT FALSE,
      ADD COLUMN admin_can_view_reports BOOLEAN DEFAULT TRUE,
      ADD COLUMN admin_can_manage_inventory BOOLEAN DEFAULT TRUE,
      ADD COLUMN admin_can_manage_menu BOOLEAN DEFAULT TRUE
    `);
    console.log('✅ Migration 016 completed');

    // Migration 017: Add printer settings
    console.log('\n📋 Running migration 017: Add printer settings...');
    await connection.execute(`
      ALTER TABLE cafe_settings
      ADD COLUMN enable_thermal_printer BOOLEAN DEFAULT FALSE,
      ADD COLUMN default_printer_type ENUM('system', 'usb', 'serial') DEFAULT 'system',
      ADD COLUMN printer_name VARCHAR(255) NULL,
      ADD COLUMN printer_port VARCHAR(100) NULL,
      ADD COLUMN printer_baud_rate INT DEFAULT 9600,
      ADD COLUMN auto_print_new_orders BOOLEAN DEFAULT FALSE,
      ADD COLUMN print_order_copies INT DEFAULT 1
    `);
    await connection.execute(`
      ALTER TABLE cafe_settings_history
      ADD COLUMN enable_thermal_printer BOOLEAN DEFAULT FALSE,
      ADD COLUMN default_printer_type ENUM('system', 'usb', 'serial') DEFAULT 'system',
      ADD COLUMN printer_name VARCHAR(255) NULL,
      ADD COLUMN printer_port VARCHAR(100) NULL,
      ADD COLUMN printer_baud_rate INT DEFAULT 9600,
      ADD COLUMN auto_print_new_orders BOOLEAN DEFAULT FALSE,
      ADD COLUMN print_order_copies INT DEFAULT 1
    `);
    console.log('✅ Migration 017 completed');

    console.log('\n🎉 All migrations completed successfully!');
  } catch (error) {
    console.error('❌ Error during migrations:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

runAllMigrations()
  .then(() => {
    console.log('🚀 Database setup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Database setup failed:', error);
    process.exit(1);
  }); 