const { pool } = require('../config/database');

async function addPromoBannersMigration() {
  let connection;

  try {
    console.log('Starting promo_banners table migration...');
    connection = await pool.getConnection();

    const [tables] = await connection.execute(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promo_banners'
    `);

    if (tables.length > 0) {
      console.log('promo_banners table already exists');
      return;
    }

    await connection.execute(`
      CREATE TABLE promo_banners (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_id INT NOT NULL,
        image_url VARCHAR(500) NOT NULL,
        link_url VARCHAR(500) NULL,
        priority INT NOT NULL DEFAULT 0,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_promo_banners_cafe_id (cafe_id),
        INDEX idx_promo_banners_active_priority (cafe_id, active, priority)
      )
    `);
    console.log('Created promo_banners table');

    console.log('Promo banners migration completed successfully');
  } catch (error) {
    console.error('Error during promo banners migration:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

addPromoBannersMigration()
  .then(() => {
    console.log('Promo banners migration finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Promo banners migration failed:', error);
    process.exit(1);
  });
