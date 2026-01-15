const { pool } = require('../config/database');

async function addFeaturedPriorityMigration() {
  let connection;

  try {
    console.log('🔧 Starting featured priority migration...');
    connection = await pool.getConnection();

    // Check if column already exists
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'menu_items' 
      AND COLUMN_NAME = 'featured_priority'
    `);

    if (columns.length > 0) {
      console.log('ℹ️  featured_priority column already exists');
      return;
    }

    // Add featured_priority column to menu_items table
    await connection.execute(`
      ALTER TABLE menu_items
      ADD COLUMN featured_priority INT NULL
    `);
    console.log('✅ Added featured_priority column to menu_items table');

    // Add index for faster queries
    await connection.execute(`
      CREATE INDEX idx_featured_priority ON menu_items(featured_priority)
    `);
    console.log('✅ Added index on featured_priority');

    console.log('✅ Featured priority migration completed successfully');
  } catch (error) {
    console.error('❌ Error during featured priority migration:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

addFeaturedPriorityMigration()
  .then(() => {
    console.log('🎉 Featured priority migration finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Featured priority migration failed:', error);
    process.exit(1);
  });
