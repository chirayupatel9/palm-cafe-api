const { pool } = require('./config/database');
const Cafe = require('./models/cafe');

async function fixCafeSettingsData() {
  try {
    console.log('Fixing cafe_settings data integrity...\n');
    
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
      console.log('cafe_id column does not exist in cafe_settings table. Please run migration first.');
      return;
    }
    
    // Get all cafe_settings
    const [settings] = await pool.execute(`
      SELECT id, cafe_id, cafe_name, is_active, created_at
      FROM cafe_settings
      ORDER BY created_at DESC
    `);
    
    console.log(`Found ${settings.length} cafe_settings records\n`);
    
    // Step 1: Fix settings with NULL cafe_id by matching cafe_name
    console.log('=== Step 1: Fixing NULL cafe_id records ===');
    const nullCafeIdSettings = settings.filter(s => !s.cafe_id);
    
    for (const setting of nullCafeIdSettings) {
      if (setting.cafe_name) {
        // Try to find a cafe with matching name
        const matchingCafe = cafes.find(c => 
          c.name.toLowerCase() === setting.cafe_name.toLowerCase() ||
          c.name === setting.cafe_name
        );
        
        if (matchingCafe) {
          console.log(`  Updating settings ID ${setting.id}: assigning to cafe "${matchingCafe.name}" (ID: ${matchingCafe.id})`);
          await pool.execute(
            'UPDATE cafe_settings SET cafe_id = ? WHERE id = ?',
            [matchingCafe.id, setting.id]
          );
        } else {
          // If no match found, assign to default cafe or the first cafe
          const defaultCafe = cafes.find(c => c.slug === 'default') || cafes[0];
          console.log(`  Updating settings ID ${setting.id}: no matching cafe found, assigning to "${defaultCafe.name}" (ID: ${defaultCafe.id})`);
          await pool.execute(
            'UPDATE cafe_settings SET cafe_id = ? WHERE id = ?',
            [defaultCafe.id, setting.id]
          );
        }
      } else {
        // No cafe_name, assign to default cafe
        const defaultCafe = cafes.find(c => c.slug === 'default') || cafes[0];
        console.log(`  Updating settings ID ${setting.id}: no cafe_name, assigning to "${defaultCafe.name}" (ID: ${defaultCafe.id})`);
        await pool.execute(
          'UPDATE cafe_settings SET cafe_id = ? WHERE id = ?',
          [defaultCafe.id, setting.id]
        );
      }
    }
    
    // Step 2: Fix cafe_name mismatches in active settings
    console.log('\n=== Step 2: Fixing cafe_name mismatches ===');
    for (const cafe of cafes) {
      const [cafeSettings] = await pool.execute(
        'SELECT id, cafe_id, cafe_name, is_active FROM cafe_settings WHERE cafe_id = ? AND is_active = TRUE',
        [cafe.id]
      );
      
      for (const setting of cafeSettings) {
        if (setting.cafe_name !== cafe.name) {
          console.log(`  Updating settings ID ${setting.id} for cafe "${cafe.name}": fixing cafe_name from "${setting.cafe_name}" to "${cafe.name}"`);
          await pool.execute(
            'UPDATE cafe_settings SET cafe_name = ? WHERE id = ?',
            [cafe.name, setting.id]
          );
        }
      }
    }
    
    // Step 3: Ensure each cafe has at least one active settings record
    console.log('\n=== Step 3: Ensuring each cafe has active settings ===');
    for (const cafe of cafes) {
      const [activeSettings] = await pool.execute(
        'SELECT id FROM cafe_settings WHERE cafe_id = ? AND is_active = TRUE',
        [cafe.id]
      );
      
      if (activeSettings.length === 0) {
        console.log(`  Cafe "${cafe.name}" has no active settings. Creating new active settings...`);
        
        // Get the most recent inactive settings for this cafe, or create new
        const [inactiveSettings] = await pool.execute(
          'SELECT * FROM cafe_settings WHERE cafe_id = ? ORDER BY created_at DESC LIMIT 1',
          [cafe.id]
        );
        
        if (inactiveSettings.length > 0) {
          // Reactivate the most recent settings
          console.log(`    Reactivating settings ID ${inactiveSettings[0].id}`);
          await pool.execute(
            'UPDATE cafe_settings SET is_active = TRUE, cafe_name = ? WHERE id = ?',
            [cafe.name, inactiveSettings[0].id]
          );
        } else {
          // Create new settings with cafe name
          console.log(`    Creating new settings record`);
          await pool.execute(
            'INSERT INTO cafe_settings (cafe_id, cafe_name, is_active, created_at, updated_at) VALUES (?, ?, TRUE, NOW(), NOW())',
            [cafe.id, cafe.name]
          );
        }
      } else if (activeSettings.length > 1) {
        // Multiple active settings - deactivate all except the most recent
        console.log(`  Cafe "${cafe.name}" has ${activeSettings.length} active settings. Deactivating older ones...`);
        const [allActive] = await pool.execute(
          'SELECT id FROM cafe_settings WHERE cafe_id = ? AND is_active = TRUE ORDER BY created_at DESC',
          [cafe.id]
        );
        
        // Keep the first (most recent) one active, deactivate the rest
        for (let i = 1; i < allActive.length; i++) {
          console.log(`    Deactivating settings ID ${allActive[i].id}`);
          await pool.execute(
            'UPDATE cafe_settings SET is_active = FALSE WHERE id = ?',
            [allActive[i].id]
          );
        }
      }
    }
    
    console.log('\n✅ Data fix completed!');
    console.log('\nRunning verification...\n');
    
    // Verify the fix
    for (const cafe of cafes) {
      const [cafeSettings] = await pool.execute(
        'SELECT id, cafe_id, cafe_name, is_active FROM cafe_settings WHERE cafe_id = ?',
        [cafe.id]
      );
      
      const activeSettings = cafeSettings.filter(s => s.is_active);
      const inactiveSettings = cafeSettings.filter(s => !s.is_active);
      
      console.log(`Cafe: ${cafe.name} (ID: ${cafe.id})`);
      console.log(`  Total settings: ${cafeSettings.length}`);
      console.log(`  Active: ${activeSettings.length}`);
      console.log(`  Inactive: ${inactiveSettings.length}`);
      
      // Check for name mismatches
      const mismatches = activeSettings.filter(s => s.cafe_name !== cafe.name);
      if (mismatches.length > 0) {
        console.log(`  ⚠️  WARNING: ${mismatches.length} active settings with name mismatch`);
      } else {
        console.log(`  ✅ All active settings have correct cafe_name`);
      }
    }
    
    // Check for remaining NULL cafe_id
    const [remainingNull] = await pool.execute(
      'SELECT COUNT(*) as count FROM cafe_settings WHERE cafe_id IS NULL'
    );
    if (remainingNull[0].count > 0) {
      console.log(`\n  ⚠️  WARNING: ${remainingNull[0].count} settings still have NULL cafe_id`);
    } else {
      console.log(`\n  ✅ No settings with NULL cafe_id remaining`);
    }
    
  } catch (error) {
    console.error('Error fixing cafe settings data:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

fixCafeSettingsData();
