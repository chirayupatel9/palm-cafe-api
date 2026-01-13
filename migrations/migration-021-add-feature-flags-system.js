const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Migration 021: Add Feature Flags System
 * 
 * This migration:
 * 1. Creates features table (global feature definitions)
 * 2. Creates cafe_feature_overrides table (per-cafe feature overrides)
 * 3. Seeds initial features based on current MODULES
 * 4. Creates indexes for performance
 */
async function migrateFeatureFlagsSystem() {
  let connection;

  try {
    // Create database connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'cafe_app',
      port: process.env.DB_PORT || 3306
    });

    console.log('🔧 Starting feature flags system migration...');

    // Step 1: Create features table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS features (
        id INT AUTO_INCREMENT PRIMARY KEY,
        \`key\` VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        default_free BOOLEAN DEFAULT FALSE,
        default_pro BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_key (\`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Features table created');

    // Step 2: Create cafe_feature_overrides table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS cafe_feature_overrides (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cafe_id INT NOT NULL,
        feature_key VARCHAR(100) NOT NULL,
        enabled BOOLEAN NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_cafe_feature (cafe_id, feature_key),
        INDEX idx_cafe_id (cafe_id),
        INDEX idx_feature_key (feature_key),
        FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE CASCADE,
        FOREIGN KEY (feature_key) REFERENCES features(\`key\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Cafe feature overrides table created');

    // Step 3: Seed initial features
    const features = [
      { key: 'orders', name: 'Orders', description: 'Create and manage orders', defaultFree: true, defaultPro: true },
      { key: 'analytics', name: 'Analytics', description: 'View analytics and insights', defaultFree: false, defaultPro: true },
      { key: 'users', name: 'User Management', description: 'Manage users and roles', defaultFree: false, defaultPro: true },
      { key: 'menu_management', name: 'Menu Management', description: 'Manage menu items and categories', defaultFree: true, defaultPro: true },
      { key: 'advanced_reports', name: 'Advanced Reports', description: 'Generate detailed reports', defaultFree: false, defaultPro: true },
      { key: 'inventory', name: 'Inventory Management', description: 'Track and manage inventory', defaultFree: false, defaultPro: true },
      { key: 'customers', name: 'Customer Management', description: 'Manage customer database', defaultFree: true, defaultPro: true },
      { key: 'invoices', name: 'Invoice Management', description: 'Generate and manage invoices', defaultFree: true, defaultPro: true },
      { key: 'payment_methods', name: 'Payment Methods', description: 'Configure payment methods', defaultFree: true, defaultPro: true },
      { key: 'settings', name: 'Settings', description: 'Configure cafe settings', defaultFree: true, defaultPro: true }
    ];

    for (const feature of features) {
      await connection.execute(`
        INSERT INTO features (\`key\`, name, description, default_free, default_pro)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          description = VALUES(description),
          default_free = VALUES(default_free),
          default_pro = VALUES(default_pro)
      `, [feature.key, feature.name, feature.description, feature.defaultFree, feature.defaultPro]);
    }
    console.log(`✅ Seeded ${features.length} features`);

    console.log('🎉 Feature flags system migration completed successfully!');

  } catch (error) {
    console.error('❌ Error during feature flags system migration:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateFeatureFlagsSystem()
    .then(() => {
      console.log('✅ Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = migrateFeatureFlagsSystem;
