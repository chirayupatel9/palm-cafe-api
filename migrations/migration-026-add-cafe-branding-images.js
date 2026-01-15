const { pool } = require('../config/database');

async function addCafeBrandingImagesMigration() {
  let connection;

  try {
    console.log('🔧 Starting cafe branding images migration...');
    connection = await pool.getConnection();

    // Check if columns already exist
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'cafe_settings' 
      AND COLUMN_NAME IN ('hero_image_url', 'promo_banner_image_url')
    `);

    const existingColumns = columns.map(col => col.COLUMN_NAME);

    // Add hero_image_url column to cafe_settings table if it doesn't exist
    if (!existingColumns.includes('hero_image_url')) {
      await connection.execute(`
        ALTER TABLE cafe_settings
        ADD COLUMN hero_image_url VARCHAR(500) NULL
      `);
      console.log('✅ Added hero_image_url column to cafe_settings table');
    } else {
      console.log('ℹ️  hero_image_url column already exists');
    }

    // Add promo_banner_image_url column to cafe_settings table if it doesn't exist
    if (!existingColumns.includes('promo_banner_image_url')) {
      await connection.execute(`
        ALTER TABLE cafe_settings
        ADD COLUMN promo_banner_image_url VARCHAR(500) NULL
      `);
      console.log('✅ Added promo_banner_image_url column to cafe_settings table');
    } else {
      console.log('ℹ️  promo_banner_image_url column already exists');
    }

    // Check if history table columns exist
    const [historyColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'cafe_settings_history' 
      AND COLUMN_NAME IN ('hero_image_url', 'promo_banner_image_url')
    `);

    const existingHistoryColumns = historyColumns.map(col => col.COLUMN_NAME);

    // Add hero_image_url column to cafe_settings_history table if it doesn't exist
    if (!existingHistoryColumns.includes('hero_image_url')) {
      await connection.execute(`
        ALTER TABLE cafe_settings_history
        ADD COLUMN hero_image_url VARCHAR(500) NULL
      `);
      console.log('✅ Added hero_image_url column to cafe_settings_history table');
    } else {
      console.log('ℹ️  hero_image_url column already exists in history table');
    }

    // Add promo_banner_image_url column to cafe_settings_history table if it doesn't exist
    if (!existingHistoryColumns.includes('promo_banner_image_url')) {
      await connection.execute(`
        ALTER TABLE cafe_settings_history
        ADD COLUMN promo_banner_image_url VARCHAR(500) NULL
      `);
      console.log('✅ Added promo_banner_image_url column to cafe_settings_history table');
    } else {
      console.log('ℹ️  promo_banner_image_url column already exists in history table');
    }

    console.log('✅ Cafe branding images migration completed successfully');
  } catch (error) {
    console.error('❌ Error during cafe branding images migration:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

addCafeBrandingImagesMigration()
  .then(() => {
    console.log('🎉 Cafe branding images migration finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Cafe branding images migration failed:', error);
    process.exit(1);
  });
