const { pool } = require('./config/database');
const Cafe = require('./models/cafe');

async function checkCafeSettingsData() {
  try {
    console.log('Checking cafe_settings data integrity...\n');
    
    // Get all cafes
    const cafes = await Cafe.getAll();
    console.log(`Found ${cafes.length} cafes\n`);
    
    // Check if cafe_id column exists
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'cafe_settings' 
      AND COLUMN_NAME = 'cafe_id'
    `);
    
    if (columns.length === 0) {
      console.log('cafe_id column does not exist in cafe_settings table');
      return;
    }
    
    // Get all cafe_settings
    const [settings] = await pool.execute(`
      SELECT id, cafe_id, cafe_name, is_active, created_at
      FROM cafe_settings
      ORDER BY created_at DESC
    `);
    
    console.log(`Found ${settings.length} cafe_settings records\n`);
    
    // Check each cafe
    for (const cafe of cafes) {
      console.log(`\n=== Cafe: ${cafe.name} (ID: ${cafe.id}, Slug: ${cafe.slug}) ===`);
      
      // Find settings for this cafe
      const cafeSettings = settings.filter(s => s.cafe_id === cafe.id);
      
      if (cafeSettings.length === 0) {
        console.log('  ❌ No settings found for this cafe');
      } else {
        const activeSettings = cafeSettings.filter(s => s.is_active);
        const inactiveSettings = cafeSettings.filter(s => !s.is_active);
        
        console.log(`  ✅ Found ${cafeSettings.length} settings record(s)`);
        console.log(`     - Active: ${activeSettings.length}`);
        console.log(`     - Inactive: ${inactiveSettings.length}`);
        
        if (activeSettings.length > 1) {
          console.log(`  ⚠️  WARNING: Multiple active settings found!`);
        }
        
        // Check cafe_name matches
        for (const setting of activeSettings) {
          if (setting.cafe_name && setting.cafe_name !== cafe.name) {
            console.log(`  ⚠️  WARNING: cafe_name mismatch! Settings: "${setting.cafe_name}", Cafe: "${cafe.name}"`);
          }
        }
      }
    }
    
    // Check for orphaned settings (settings with cafe_id that doesn't exist)
    console.log('\n\n=== Checking for orphaned settings ===');
    const orphanedSettings = [];
    for (const setting of settings) {
      if (setting.cafe_id) {
        const cafeExists = cafes.find(c => c.id === setting.cafe_id);
        if (!cafeExists) {
          orphanedSettings.push(setting);
        }
      }
    }
    
    if (orphanedSettings.length > 0) {
      console.log(`  ⚠️  Found ${orphanedSettings.length} orphaned settings:`);
      orphanedSettings.forEach(s => {
        console.log(`     - Settings ID: ${s.id}, cafe_id: ${s.cafe_id}, cafe_name: ${s.cafe_name || 'N/A'}`);
      });
    } else {
      console.log('  ✅ No orphaned settings found');
    }
    
    // Check for settings with NULL cafe_id
    const nullCafeIdSettings = settings.filter(s => !s.cafe_id);
    if (nullCafeIdSettings.length > 0) {
      console.log(`\n  ⚠️  Found ${nullCafeIdSettings.length} settings with NULL cafe_id:`);
      nullCafeIdSettings.forEach(s => {
        console.log(`     - Settings ID: ${s.id}, cafe_name: ${s.cafe_name || 'N/A'}`);
      });
    }
    
  } catch (error) {
    console.error('Error checking cafe settings data:', error);
  } finally {
    await pool.end();
  }
}

checkCafeSettingsData();
