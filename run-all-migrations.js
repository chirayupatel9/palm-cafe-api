const { pool } = require('./config/database');

// Helper function to check if a column exists
async function columnExists(connection, tableName, columnName) {
  try {
    const [rows] = await connection.execute(`
      SELECT COUNT(*) as count 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = ? 
      AND COLUMN_NAME = ?
    `, [tableName, columnName]);
    return rows[0].count > 0;
  } catch (error) {
    return false;
  }
}

// Helper function to safely add column
async function addColumnIfNotExists(connection, tableName, columnName, columnDefinition) {
  const exists = await columnExists(connection, tableName, columnName);
  if (!exists) {
    await connection.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
    return true;
  }
  return false;
}

// Helper function to check if ENUM value exists
async function enumValueExists(connection, tableName, columnName, enumValue) {
  try {
    const [rows] = await connection.execute(`
      SELECT COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = ? 
      AND COLUMN_NAME = ?
    `, [tableName, columnName]);
    if (rows.length > 0) {
      const enumString = rows[0].COLUMN_TYPE;
      return enumString.includes(enumValue);
    }
    return false;
  } catch (error) {
    return false;
  }
}

async function runAllMigrations() {
  let connection;

  try {
    console.log('🚀 Starting all migrations...');
    connection = await pool.getConnection();

    // Migration 011: Add surface colors
    console.log('\n📋 Running migration 011: Add surface colors...');
    await addColumnIfNotExists(connection, 'cafe_settings', 'light_surface_color', "VARCHAR(7) DEFAULT '#FFFFFF'");
    await addColumnIfNotExists(connection, 'cafe_settings', 'dark_surface_color', "VARCHAR(7) DEFAULT '#1F2937'");
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'light_surface_color', "VARCHAR(7) DEFAULT '#FFFFFF'");
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'dark_surface_color', "VARCHAR(7) DEFAULT '#1F2937'");
    console.log('✅ Migration 011 completed');

    // Migration 012: Add menu images
    console.log('\n📋 Running migration 012: Add menu images...');
    await addColumnIfNotExists(connection, 'menu_items', 'image_url', 'VARCHAR(255) NULL');
    await addColumnIfNotExists(connection, 'cafe_settings', 'show_menu_images', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'show_menu_images', 'BOOLEAN DEFAULT TRUE');
    console.log('✅ Migration 012 completed');

    // Migration 013: Add chef visibility
    console.log('\n📋 Running migration 013: Add chef visibility...');
    await addColumnIfNotExists(connection, 'cafe_settings', 'chef_show_kitchen_tab', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'chef_show_menu_tab', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'chef_show_inventory_tab', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'chef_show_history_tab', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'chef_can_edit_orders', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'chef_can_view_customers', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'chef_can_view_payments', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'chef_show_kitchen_tab', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'chef_show_menu_tab', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'chef_show_inventory_tab', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'chef_show_history_tab', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'chef_can_edit_orders', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'chef_can_view_customers', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'chef_can_view_payments', 'BOOLEAN DEFAULT FALSE');
    console.log('✅ Migration 013 completed');

    // Migration 014: Add chef and reception roles
    console.log('\n📋 Running migration 014: Add chef and reception roles...');
    const hasChefRole = await enumValueExists(connection, 'users', 'role', 'chef');
    const hasReceptionRole = await enumValueExists(connection, 'users', 'role', 'reception');
    if (!hasChefRole || !hasReceptionRole) {
      await connection.execute(`
        ALTER TABLE users 
        MODIFY COLUMN role ENUM('admin', 'user', 'chef', 'reception') DEFAULT 'user'
      `);
    }
    console.log('✅ Migration 014 completed');

    // Migration 015: Add reception settings
    console.log('\n📋 Running migration 015: Add reception settings...');
    await addColumnIfNotExists(connection, 'cafe_settings', 'reception_show_kitchen_tab', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'reception_show_menu_tab', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'reception_show_inventory_tab', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'reception_show_history_tab', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'reception_can_edit_orders', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'reception_can_view_customers', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'reception_can_view_payments', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'reception_can_create_orders', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'reception_show_kitchen_tab', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'reception_show_menu_tab', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'reception_show_inventory_tab', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'reception_show_history_tab', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'reception_can_edit_orders', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'reception_can_view_customers', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'reception_can_view_payments', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'reception_can_create_orders', 'BOOLEAN DEFAULT TRUE');
    console.log('✅ Migration 015 completed');

    // Migration 016: Add superadmin
    console.log('\n📋 Running migration 016: Add superadmin...');
    const hasSuperadminRole = await enumValueExists(connection, 'users', 'role', 'superadmin');
    if (!hasSuperadminRole) {
      await connection.execute(`
        ALTER TABLE users 
        MODIFY COLUMN role ENUM('admin', 'user', 'chef', 'reception', 'superadmin') DEFAULT 'user'
      `);
    }
    await addColumnIfNotExists(connection, 'cafe_settings', 'admin_can_access_settings', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'admin_can_manage_users', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'admin_can_view_reports', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'admin_can_manage_inventory', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'admin_can_manage_menu', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'admin_can_access_settings', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'admin_can_manage_users', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'admin_can_view_reports', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'admin_can_manage_inventory', 'BOOLEAN DEFAULT TRUE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'admin_can_manage_menu', 'BOOLEAN DEFAULT TRUE');
    console.log('✅ Migration 016 completed');

    // Migration 017: Add printer settings
    console.log('\n📋 Running migration 017: Add printer settings...');
    await addColumnIfNotExists(connection, 'cafe_settings', 'enable_thermal_printer', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'default_printer_type', "ENUM('system', 'usb', 'serial') DEFAULT 'system'");
    await addColumnIfNotExists(connection, 'cafe_settings', 'printer_name', 'VARCHAR(255) NULL');
    await addColumnIfNotExists(connection, 'cafe_settings', 'printer_port', 'VARCHAR(100) NULL');
    await addColumnIfNotExists(connection, 'cafe_settings', 'printer_baud_rate', 'INT DEFAULT 9600');
    await addColumnIfNotExists(connection, 'cafe_settings', 'auto_print_new_orders', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings', 'print_order_copies', 'INT DEFAULT 1');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'enable_thermal_printer', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'default_printer_type', "ENUM('system', 'usb', 'serial') DEFAULT 'system'");
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'printer_name', 'VARCHAR(255) NULL');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'printer_port', 'VARCHAR(100) NULL');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'printer_baud_rate', 'INT DEFAULT 9600');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'auto_print_new_orders', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(connection, 'cafe_settings_history', 'print_order_copies', 'INT DEFAULT 1');
    console.log('✅ Migration 017 completed');

    // Migration 018: Add table number
    console.log('\n📋 Running migration 018: Add table number...');
    await addColumnIfNotExists(connection, 'orders', 'table_number', 'VARCHAR(20) NULL');
    // Check if index exists before creating
    try {
      const [indexCheck] = await connection.execute(`
        SELECT COUNT(*) as count 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'orders' 
        AND INDEX_NAME = 'idx_table_number'
      `);
      if (indexCheck[0].count === 0) {
        await connection.execute(`CREATE INDEX idx_table_number ON orders(table_number)`);
      }
    } catch (error) {
      // Index might already exist, ignore
      if (!error.message.includes('Duplicate key name')) {
        throw error;
      }
    }
    console.log('✅ Migration 018 completed');

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