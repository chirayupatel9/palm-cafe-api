const { pool } = require('../config/database');

async function addChefReceptionRolesMigration() {
  let connection;

  try {
    console.log('🔧 Starting chef and reception roles migration...');
    connection = await pool.getConnection();

    // Update users table to include chef and reception roles
    await connection.execute(`
      ALTER TABLE users 
      MODIFY COLUMN role ENUM('admin', 'user', 'chef', 'reception') DEFAULT 'user'
    `);
    console.log('✅ Updated users table role ENUM to include chef and reception');

    console.log('✅ Chef and reception roles migration completed successfully');
  } catch (error) {
    console.error('❌ Error during chef and reception roles migration:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

addChefReceptionRolesMigration()
  .then(() => {
    console.log('🎉 Chef and reception roles migration finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Chef and reception roles migration failed:', error);
    process.exit(1);
  }); 