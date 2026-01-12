const { pool } = require('./config/database');

async function quickUpgradeSuperadmin() {
  let connection;
  
  try {
    console.log('🔧 Upgrading first admin user to superadmin...\n');
    connection = await pool.getConnection();
    
    // Check if superadmin role exists
    const [roleCheck] = await connection.execute(`
      SELECT COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'role'
    `);
    
    if (roleCheck.length === 0) {
      console.error('❌ Users table not found. Please run database setup first.');
      process.exit(1);
    }
    
    const roleEnum = roleCheck[0].COLUMN_TYPE;
    if (!roleEnum.includes('superadmin')) {
      console.log('⚠️  Superadmin role not found in database.');
      console.log('Please run the migration first: node run-all-migrations.js');
      process.exit(1);
    }
    
    // Check if any superadmin already exists
    const [existingSuperadmins] = await connection.execute(
      "SELECT COUNT(*) as count FROM users WHERE role = 'superadmin'"
    );
    
    if (existingSuperadmins[0].count > 0) {
      const [superadmins] = await connection.execute(
        "SELECT id, username, email FROM users WHERE role = 'superadmin'"
      );
      console.log('✅ Superadmin users already exist:\n');
      superadmins.forEach(sa => {
        console.log(`   - ${sa.username} (${sa.email})`);
      });
      console.log('\nYou can log in with any of these accounts to access /superadmin');
      process.exit(0);
    }
    
    // Find first admin user
    const [admins] = await connection.execute(
      "SELECT id, username, email, role FROM users WHERE role = 'admin' LIMIT 1"
    );
    
    if (admins.length === 0) {
      console.error('❌ No admin users found. Please create an admin user first.');
      process.exit(1);
    }
    
    const adminUser = admins[0];
    console.log(`Found admin user: ${adminUser.username} (${adminUser.email})`);
    console.log('Upgrading to superadmin...\n');
    
    // Update user role
    await connection.execute(
      'UPDATE users SET role = ?, updated_at = NOW() WHERE id = ?',
      ['superadmin', adminUser.id]
    );
    
    console.log('✅ User upgraded to superadmin successfully!');
    console.log(`   Username: ${adminUser.username}`);
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   New Role: superadmin`);
    console.log('\n🎉 You can now log in and access the /superadmin page!');
    
  } catch (error) {
    console.error('❌ Error upgrading user:', error);
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
    process.exit(0);
  }
}

quickUpgradeSuperadmin();
