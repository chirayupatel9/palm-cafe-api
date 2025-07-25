const { pool } = require('../config/database');

async function addIncludeTaxToggle() {
  try {
    console.log('🔄 Starting migration: Add include_tax toggle to tax settings...');
    
    const connection = await pool.getConnection();
    
    // Add include_tax column to tax_settings table
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tax_settings' 
      AND COLUMN_NAME = 'include_tax'
    `);
    
    if (columns.length === 0) {
      await connection.execute(`
        ALTER TABLE tax_settings 
        ADD COLUMN include_tax BOOLEAN DEFAULT TRUE 
        AFTER show_tax_in_menu
      `);
      console.log('✅ Added include_tax column to tax_settings table');
    } else {
      console.log('ℹ️ include_tax column already exists');
    }
    
    connection.release();
    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  addIncludeTaxToggle()
    .then(() => {
      console.log('🎉 Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addIncludeTaxToggle; 