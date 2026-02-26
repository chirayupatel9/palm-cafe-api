const { pool } = require('../config/database');

async function addSuperadminMigration() {
  let connection;

  try {
    console.log('🔧 Starting superadmin migration...');
    connection = await pool.getConnection();

    // Update users table to include superadmin role
    await connection.execute(`
      ALTER TABLE users 
      MODIFY COLUMN role ENUM('admin', 'user', 'chef', 'reception', 'superadmin') DEFAULT 'user'
    `);
    console.log('✅ Updated users table role ENUM to include superadmin');

    // Add admin permissions columns to cafe_settings table
    await connection.execute(`
      ALTER TABLE cafe_settings
      ADD COLUMN admin_can_access_settings BOOLEAN DEFAULT FALSE,
      ADD COLUMN admin_can_manage_users BOOLEAN DEFAULT FALSE,
      ADD COLUMN admin_can_view_reports BOOLEAN DEFAULT TRUE,
      ADD COLUMN admin_can_manage_inventory BOOLEAN DEFAULT TRUE,
      ADD COLUMN admin_can_manage_menu BOOLEAN DEFAULT TRUE
    `);
    console.log('✅ Added admin permissions columns to cafe_settings table');

    // Add admin permissions columns to cafe_settings_history table
    await connection.execute(`
      ALTER TABLE cafe_settings_history
      ADD COLUMN admin_can_access_settings BOOLEAN DEFAULT FALSE,
      ADD COLUMN admin_can_manage_users BOOLEAN DEFAULT FALSE,
      ADD COLUMN admin_can_view_reports BOOLEAN DEFAULT TRUE,
      ADD COLUMN admin_can_manage_inventory BOOLEAN DEFAULT TRUE,
      ADD COLUMN admin_can_manage_menu BOOLEAN DEFAULT TRUE
    `);
    console.log('✅ Added admin permissions columns to cafe_settings_history table');

    console.log('✅ Superadmin migration completed successfully');
  } catch (error) {
    console.error('❌ Error during superadmin migration:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

if (require.main === module) {
  addSuperadminMigration()
    .then(() => { console.log('🎉 Superadmin migration finished'); process.exit(0); })
    .catch((error) => { console.error('💥 Superadmin migration failed:', error); process.exit(1); });
}
module.exports = addSuperadminMigration; 