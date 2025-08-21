const { pool } = require('../config/database');

async function addPrinterSettingsMigration() {
  let connection;

  try {
    console.log('🔧 Starting printer settings migration...');
    connection = await pool.getConnection();

    // Add printer settings columns to cafe_settings table
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
    console.log('✅ Added printer settings columns to cafe_settings table');

    // Add printer settings columns to cafe_settings_history table
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
    console.log('✅ Added printer settings columns to cafe_settings_history table');

    console.log('✅ Printer settings migration completed successfully');
  } catch (error) {
    console.error('❌ Error during printer settings migration:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

addPrinterSettingsMigration()
  .then(() => {
    console.log('🎉 Printer settings migration finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Printer settings migration failed:', error);
    process.exit(1);
  }); 