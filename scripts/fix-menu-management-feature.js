const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Script to verify and fix menu_management feature in database
 * This ensures the feature exists and is enabled for both FREE and PRO plans
 */
async function fixMenuManagementFeature() {
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

    console.log('🔧 Checking menu_management feature...');

    // Check if feature exists
    const [features] = await connection.execute(
      'SELECT * FROM features WHERE `key` = ?',
      ['menu_management']
    );

    if (features.length === 0) {
      console.log('❌ Feature does not exist. Creating...');
      await connection.execute(
        `INSERT INTO features (\`key\`, name, description, default_free, default_pro)
         VALUES (?, ?, ?, ?, ?)`,
        ['menu_management', 'Menu Management', 'Manage menu items and categories', true, true]
      );
      console.log('✅ Feature created');
    } else {
      const feature = features[0];
      console.log('📋 Current feature state:', {
        key: feature.key,
        name: feature.name,
        default_free: feature.default_free,
        default_pro: feature.default_pro
      });

      // Check if defaults are correct
      if (feature.default_free !== 1 || feature.default_pro !== 1) {
        console.log('⚠️  Feature defaults are incorrect. Fixing...');
        await connection.execute(
          `UPDATE features 
           SET default_free = ?, default_pro = ?
           WHERE \`key\` = ?`,
          [true, true, 'menu_management']
        );
        console.log('✅ Feature defaults updated');
      } else {
        console.log('✅ Feature defaults are correct');
      }
    }

    // Check for any cafe overrides that might be disabling it
    const [overrides] = await connection.execute(
      'SELECT * FROM cafe_feature_overrides WHERE feature_key = ? AND enabled = ?',
      ['menu_management', false]
    );

    if (overrides.length > 0) {
      console.log(`⚠️  Found ${overrides.length} cafe override(s) disabling menu_management:`);
      overrides.forEach(override => {
        console.log(`   - Cafe ID: ${override.cafe_id}`);
      });
      console.log('💡 Consider removing these overrides if menu_management should be enabled');
    } else {
      console.log('✅ No disabling overrides found');
    }

    console.log('🎉 Menu management feature check completed!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ER_NO_SUCH_TABLE') {
      console.error('💡 The features table does not exist. Please run the feature flags migration first.');
    }
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run the script
if (require.main === module) {
  fixMenuManagementFeature()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = fixMenuManagementFeature;
