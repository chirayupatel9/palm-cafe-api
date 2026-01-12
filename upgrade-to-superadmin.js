const { pool } = require('./config/database');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function upgradeToSuperadmin() {
  let connection;
  
  try {
    console.log('🔧 Upgrade user to superadmin...\n');
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
      console.log('Please run the migration first: node migrations/migration-016-add-superadmin.js');
      process.exit(1);
    }
    
    // List all users
    const [users] = await connection.execute(
      'SELECT id, username, email, role FROM users ORDER BY id'
    );
    
    if (users.length === 0) {
      console.error('❌ No users found in database.');
      process.exit(1);
    }
    
    console.log('\nExisting users:');
    users.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.username} (${user.email}) - Role: ${user.role}`);
    });
    
    const userChoice = await question('\nEnter the number of the user to upgrade to superadmin: ');
    const userIndex = parseInt(userChoice) - 1;
    
    if (isNaN(userIndex) || userIndex < 0 || userIndex >= users.length) {
      console.error('❌ Invalid selection.');
      process.exit(1);
    }
    
    const selectedUser = users[userIndex];
    
    if (selectedUser.role === 'superadmin') {
      console.log('⚠️  This user is already a superadmin.');
      process.exit(0);
    }
    
    // Confirm
    const confirm = await question(`\nUpgrade ${selectedUser.username} (${selectedUser.email}) to superadmin? (y/n): `);
    if (confirm.toLowerCase() !== 'y') {
      console.log('Cancelled.');
      process.exit(0);
    }
    
    // Update user role
    await connection.execute(
      'UPDATE users SET role = ?, updated_at = NOW() WHERE id = ?',
      ['superadmin', selectedUser.id]
    );
    
    console.log('\n✅ User upgraded to superadmin successfully!');
    console.log(`   Username: ${selectedUser.username}`);
    console.log(`   Email: ${selectedUser.email}`);
    console.log(`   New Role: superadmin`);
    console.log('\nYou can now log in and access the /superadmin page.');
    
  } catch (error) {
    console.error('❌ Error upgrading user:', error);
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
    rl.close();
    process.exit(0);
  }
}

upgradeToSuperadmin();
