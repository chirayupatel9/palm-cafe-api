const { pool } = require('./config/database');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function createFirstSuperadmin() {
  let connection;
  
  try {
    console.log('🔧 Creating first superadmin user...\n');
    connection = await pool.getConnection();
    
    // Check if superadmin role exists in the database
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
      console.log('⚠️  Superadmin role not found in database. Running migration first...');
      const migration = require('./migrations/migration-016-add-superadmin');
      // Note: This will run the migration, but we need to handle it differently
      console.log('Please run the migration first: node migrations/migration-016-add-superadmin.js');
      process.exit(1);
    }
    
    // Check if any superadmin already exists
    const [existingSuperadmins] = await connection.execute(
      "SELECT COUNT(*) as count FROM users WHERE role = 'superadmin'"
    );
    
    if (existingSuperadmins[0].count > 0) {
      console.log('⚠️  Superadmin users already exist in the database.');
      const [superadmins] = await connection.execute(
        "SELECT id, username, email FROM users WHERE role = 'superadmin'"
      );
      console.log('\nExisting superadmins:');
      superadmins.forEach(sa => {
        console.log(`  - ${sa.username} (${sa.email})`);
      });
      
      const proceed = await question('\nDo you want to create another superadmin? (y/n): ');
      if (proceed.toLowerCase() !== 'y') {
        console.log('Cancelled.');
        process.exit(0);
      }
    }
    
    // Get user input
    const username = await question('Enter username: ');
    const email = await question('Enter email: ');
    const password = await question('Enter password: ');
    
    if (!username || !email || !password) {
      console.error('❌ All fields are required.');
      process.exit(1);
    }
    
    if (password.length < 6) {
      console.error('❌ Password must be at least 6 characters long.');
      process.exit(1);
    }
    
    // Check if user already exists
    const [existingUser] = await connection.execute(
      'SELECT * FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    
    if (existingUser.length > 0) {
      console.error('❌ User with this email or username already exists.');
      process.exit(1);
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create superadmin user
    await connection.execute(
      'INSERT INTO users (username, email, password, role, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [username, email, hashedPassword, 'superadmin']
    );
    
    console.log('\n✅ Superadmin user created successfully!');
    console.log(`   Username: ${username}`);
    console.log(`   Email: ${email}`);
    console.log(`   Role: superadmin`);
    console.log('\nYou can now log in with these credentials.');
    
  } catch (error) {
    console.error('❌ Error creating superadmin:', error);
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
    rl.close();
    process.exit(0);
  }
}

createFirstSuperadmin();
