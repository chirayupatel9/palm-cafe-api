const { pool } = require('../config/database');

class CafeSettings {
  // Get current cafe settings
  static async getCurrent(cafeId = null) {
    try {
      // First, check which columns exist in the cafe_settings table
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'cafe_settings'
      `);
      
      const existingColumns = columns.map(col => col.COLUMN_NAME);
      const hasCafeIdColumn = existingColumns.includes('cafe_id');
      
      // Build dynamic SELECT query based on existing columns
      const selectColumns = existingColumns.filter(col => 
        col !== 'id' && col !== 'is_active' && col !== 'created_at' && col !== 'updated_at'
      );
      
      if (selectColumns.length === 0) {
        // If no columns exist, return default settings
        return this.getDefaultSettings();
      }
      
      // Build WHERE clause
      let whereClause = 'WHERE is_active = TRUE';
      const queryParams = [];
      
      // If cafe_id column exists and cafeId is provided, filter by cafe_id
      if (hasCafeIdColumn && cafeId) {
        whereClause += ' AND cafe_id = ?';
        queryParams.push(cafeId);
      } else if (hasCafeIdColumn && !cafeId) {
        // If cafe_id column exists but no cafeId provided, this is expected for:
        // - Legacy code paths
        // - Startup/initialization
        // - Default settings retrieval
        // Only warn in development to reduce noise
        if (process.env.NODE_ENV !== 'production') {
          console.debug('cafe_id column exists but no cafeId provided to getCurrent() - returning default settings');
        }
        // Return default settings instead of potentially wrong cafe's settings
        return this.getDefaultSettings();
      }
      
      const [rows] = await pool.execute(`
        SELECT ${selectColumns.join(', ')}
        FROM cafe_settings 
        ${whereClause}
        ORDER BY created_at DESC 
        LIMIT 1
      `, queryParams);

      if (rows.length === 0) {
        // Return default settings if no settings exist
        return this.getDefaultSettings();
      }

      const settings = rows[0];
      
      // Verify cafe_id matches if both are provided and cafe_id column exists
      if (hasCafeIdColumn && cafeId && settings.cafe_id && settings.cafe_id !== cafeId) {
        console.error(`[CafeSettings.getCurrent] ERROR: cafe_id mismatch! Requested: ${cafeId}, Got: ${settings.cafe_id}`);
        // Return default settings instead of wrong data
        console.warn(`[CafeSettings.getCurrent] Returning default settings due to cafe_id mismatch`);
        return this.getDefaultSettings();
      }

      return settings;
    } catch (error) {
      // If there's an error (e.g., table doesn't exist), return default settings
      console.warn('Error fetching cafe settings, returning defaults:', error.message);
      return this.getDefaultSettings();
    }
  }

  // Get default cafe settings
  static getDefaultSettings() {
    return {
      cafe_name: null,
      logo_url: null,
      hero_image_url: null,
      promo_banner_image_url: null,
      address: '',
      phone: '',
      email: '',
      website: '',
      opening_hours: '',
      description: '',
      show_kitchen_tab: true,
      show_customers_tab: true,
      show_payment_methods_tab: true,
      show_menu_tab: true,
      show_inventory_tab: true,
      show_history_tab: true,
      show_menu_images: true,
      chef_show_kitchen_tab: true,
      chef_show_menu_tab: false,
      chef_show_inventory_tab: false,
      chef_show_history_tab: true,
      chef_can_edit_orders: true,
      chef_can_view_customers: false,
      chef_can_view_payments: false,
      reception_show_kitchen_tab: true,
      reception_show_menu_tab: false,
      reception_show_inventory_tab: false,
      reception_show_history_tab: true,
      reception_can_edit_orders: true,
      reception_can_view_customers: true,
      reception_can_view_payments: true,
      reception_can_create_orders: true,
      admin_can_access_settings: false,
      admin_can_manage_users: false,
      admin_can_view_reports: true,
      admin_can_manage_inventory: true,
      admin_can_manage_menu: true,
      enable_thermal_printer: false,
      default_printer_type: 'system',
      printer_name: null,
      printer_port: null,
      printer_baud_rate: 9600,
      auto_print_new_orders: false,
      print_order_copies: 1,
      color_scheme: 'default',
      primary_color: '#75826b',
      secondary_color: '#153059',
      accent_color: '#e0a066',
      light_primary_color: '#3B82F6',
      light_secondary_color: '#6B7280',
      light_accent_color: '#10B981',
      light_background_color: '#FFFFFF',
      light_text_color: '#1F2937',
      light_surface_color: '#F9FAFB',
      dark_primary_color: '#60A5FA',
      dark_secondary_color: '#9CA3AF',
      dark_accent_color: '#34D399',
      dark_background_color: '#111827',
      dark_text_color: '#F9FAFB',
      dark_surface_color: '#1F2937',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    };
  }

  // Update cafe settings
  static async update(settingsData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // First, check which columns exist in the cafe_settings table
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'cafe_settings'
      `);
      
      const existingColumns = columns.map(col => col.COLUMN_NAME);
      
      // Build dynamic INSERT query based on existing columns
      const insertColumns = [];
      const insertValues = [];
      const insertPlaceholders = [];
      
      // Basic columns that should always exist
      const basicColumns = [
        'cafe_name', 'logo_url', 'address', 'phone', 'email', 'website', 
        'opening_hours', 'description', 'is_active', 'created_at', 'updated_at'
      ];
      
      // Extended columns that may not exist yet
      const extendedColumns = [
        'hero_image_url', 'promo_banner_image_url',
        'show_kitchen_tab', 'show_customers_tab', 'show_payment_methods_tab', 
        'show_menu_tab', 'show_inventory_tab', 'show_history_tab', 'show_menu_images',
        'chef_show_kitchen_tab', 'chef_show_menu_tab', 'chef_show_inventory_tab', 
        'chef_show_history_tab', 'chef_can_edit_orders', 'chef_can_view_customers', 
        'chef_can_view_payments', 'reception_show_kitchen_tab', 'reception_show_menu_tab', 
        'reception_show_inventory_tab', 'reception_show_history_tab', 'reception_can_edit_orders', 
        'reception_can_view_customers', 'reception_can_view_payments', 'reception_can_create_orders',
        'admin_can_access_settings', 'admin_can_manage_users', 'admin_can_view_reports', 
        'admin_can_manage_inventory', 'admin_can_manage_menu', 'enable_thermal_printer', 
        'default_printer_type', 'printer_name', 'printer_port', 'printer_baud_rate', 
        'auto_print_new_orders', 'print_order_copies', 'light_primary_color', 
        'light_secondary_color', 'light_accent_color', 'light_background_color', 
        'light_text_color', 'light_surface_color', 'dark_primary_color', 
        'dark_secondary_color', 'dark_accent_color', 'dark_background_color', 
        'dark_text_color', 'dark_surface_color', 'color_scheme', 'primary_color', 
        'secondary_color', 'accent_color'
      ];
      
      // Add basic columns
      basicColumns.forEach(col => {
        if (existingColumns.includes(col)) {
          insertColumns.push(col);
          insertPlaceholders.push('?');
          if (col === 'is_active') {
            insertValues.push(true);
          } else if (col === 'created_at' || col === 'updated_at') {
            insertValues.push(new Date());
          } else if (col === 'cafe_name') {
            insertValues.push(settingsData.cafe_name);
          } else if (col === 'logo_url') {
            insertValues.push(settingsData.logo_url || null);
          } else {
            insertValues.push(settingsData[col] || '');
          }
        }
      });
      
      // Add extended columns if they exist
      extendedColumns.forEach(col => {
        if (existingColumns.includes(col)) {
          insertColumns.push(col);
          insertPlaceholders.push('?');
          
          if (col === 'hero_image_url' || col === 'promo_banner_image_url') {
            insertValues.push(settingsData[col] || null);
          } else if (col.includes('show_') || col.includes('can_') || col.includes('enable_') || col.includes('auto_print_')) {
            insertValues.push(settingsData[col] !== false);
          } else if (col === 'default_printer_type') {
            insertValues.push(settingsData[col] || 'system');
          } else if (col === 'printer_baud_rate') {
            insertValues.push(settingsData[col] || 9600);
          } else if (col === 'print_order_copies') {
            insertValues.push(settingsData[col] || 1);
          } else if (col.includes('_color')) {
            // Handle color columns with defaults
            const colorDefaults = {
              light_primary_color: '#3B82F6',
              light_secondary_color: '#6B7280',
              light_accent_color: '#10B981',
              light_background_color: '#FFFFFF',
              light_text_color: '#1F2937',
              light_surface_color: '#F9FAFB',
              dark_primary_color: '#60A5FA',
              dark_secondary_color: '#9CA3AF',
              dark_accent_color: '#34D399',
              dark_background_color: '#111827',
              dark_text_color: '#F9FAFB',
              dark_surface_color: '#1F2937',
              primary_color: '#75826b',
              secondary_color: '#153059',
              accent_color: '#e0a066'
            };
            insertValues.push(settingsData[col] || colorDefaults[col]);
          } else if (col === 'color_scheme') {
            insertValues.push(settingsData[col] || 'default');
          } else {
            insertValues.push(settingsData[col] || null);
          }
        }
      });

      // Add cafe_id if column exists and value is provided
      if (existingColumns.includes('cafe_id') && settingsData.cafe_id) {
        insertColumns.push('cafe_id');
        insertPlaceholders.push('?');
        insertValues.push(settingsData.cafe_id);
        console.log('[CafeSettings.update] Including cafe_id in insert:', settingsData.cafe_id);
      }

      // Check if we should update existing record or create new one
      const hasCafeIdColumn = existingColumns.includes('cafe_id');
      let shouldUpdate = false;
      let existingSettingsId = null;
      
      if (hasCafeIdColumn && settingsData.cafe_id) {
        // Check if active settings exist for this cafe
        const [existing] = await connection.execute(
          'SELECT id FROM cafe_settings WHERE cafe_id = ? AND is_active = TRUE LIMIT 1',
          [settingsData.cafe_id]
        );
        
        if (existing.length > 0) {
          shouldUpdate = true;
          existingSettingsId = existing[0].id;
          console.log('[CafeSettings.update] Updating existing settings record ID:', existingSettingsId);
        } else {
          console.log('[CafeSettings.update] No active settings found, creating new record');
        }
      } else {
        // Legacy: no cafe_id column, check if any active settings exist
        const [existing] = await connection.execute(
          'SELECT id FROM cafe_settings WHERE is_active = TRUE LIMIT 1'
        );
        
        if (existing.length > 0) {
          shouldUpdate = true;
          existingSettingsId = existing[0].id;
          console.log('[CafeSettings.update] Updating existing settings record ID:', existingSettingsId);
        }
      }
      
      if (shouldUpdate && existingSettingsId) {
        // UPDATE existing record instead of creating new one
        const updateFields = [];
        const updateValues = [];
        
        // Build update fields (exclude id, is_active, created_at, updated_at, cafe_id)
        insertColumns.forEach((col, index) => {
          if (col !== 'id' && col !== 'is_active' && col !== 'created_at' && col !== 'cafe_id') {
            updateFields.push(`${col} = ?`);
            updateValues.push(insertValues[index]);
          }
        });
        
        // Always update updated_at
        if (existingColumns.includes('updated_at')) {
          updateFields.push('updated_at = NOW()');
        }
        
        if (updateFields.length > 0) {
          updateValues.push(existingSettingsId);
          
          const updateQuery = `
            UPDATE cafe_settings 
            SET ${updateFields.join(', ')}
            WHERE id = ?
          `;
          
          await connection.execute(updateQuery, updateValues);
        }
      } else {
        // No existing active settings, create new record
        // Deactivate any other active settings for this cafe (if cafe_id exists)
        if (hasCafeIdColumn && settingsData.cafe_id) {
          await connection.execute(
            'UPDATE cafe_settings SET is_active = FALSE WHERE cafe_id = ?',
            [settingsData.cafe_id]
          );
        } else {
          // Legacy: no cafe_id column, deactivate all
          await connection.execute('UPDATE cafe_settings SET is_active = FALSE');
        }
        
        // Insert new settings with dynamic columns
        const insertQuery = `
          INSERT INTO cafe_settings (${insertColumns.join(', ')}) 
          VALUES (${insertPlaceholders.join(', ')})
        `;
        
        await connection.execute(insertQuery, insertValues);
      }

      // Build history insert query (only use columns that exist in history table)
      const [historyColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'cafe_settings_history'
      `);
      
      const existingHistoryColumns = historyColumns.map(col => col.COLUMN_NAME);
      
      const historyInsertColumns = [];
      const historyInsertValues = [];
      const historyInsertPlaceholders = [];
      
      // Add columns that exist in both tables
      insertColumns.forEach(col => {
        if (existingHistoryColumns.includes(col)) {
          historyInsertColumns.push(col);
          historyInsertPlaceholders.push('?');
          // For history, we want the same values except for timestamps
          if (col === 'created_at' || col === 'updated_at') {
            historyInsertValues.push(new Date());
          } else {
            historyInsertValues.push(insertValues[insertColumns.indexOf(col)]);
          }
        }
      });
      
      // Add history-specific columns
      if (existingHistoryColumns.includes('changed_by')) {
        historyInsertColumns.push('changed_by');
        historyInsertPlaceholders.push('?');
        historyInsertValues.push(settingsData.changed_by || 'admin');
      }
      
      if (existingHistoryColumns.includes('changed_at')) {
        historyInsertColumns.push('changed_at');
        historyInsertPlaceholders.push('?');
        historyInsertValues.push(new Date());
      }
      
      // Insert into history table
      if (historyInsertColumns.length > 0) {
        const historyQuery = `
          INSERT INTO cafe_settings_history (${historyInsertColumns.join(', ')}) 
          VALUES (${historyInsertPlaceholders.join(', ')})
        `;
        await connection.execute(historyQuery, historyInsertValues);
      }

      await connection.commit();

      // Return the updated settings - use cafe_id if provided
      const cafeId = settingsData.cafe_id || null;
      return await this.getCurrent(cafeId);
    } catch (error) {
      await connection.rollback();
      console.error('Error in cafe settings update:', error);
      throw new Error(`Error updating cafe settings: ${error.message}`);
    } finally {
      connection.release();
    }
  }

  // Get cafe settings history
  static async getHistory() {
    try {
      // Check if the history table exists
      const [tables] = await pool.execute(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'cafe_settings_history'
      `);
      
      if (tables.length === 0) {
        console.warn('cafe_settings_history table does not exist, returning empty array');
        return [];
      }
      
      const [rows] = await pool.execute(
        'SELECT * FROM cafe_settings_history ORDER BY changed_at DESC LIMIT 20'
      );
      return rows;
    } catch (error) {
      console.warn('Error fetching cafe settings history:', error.message);
      return [];
    }
  }

  // Upload logo
  static async updateLogo(logoUrl, cafeId = null) {
    try {
      console.log('[CafeSettings.updateLogo] Starting update', { logoUrl, cafeId });
      const currentSettings = await this.getCurrent(cafeId);
      const updatedSettings = {
        ...currentSettings,
        logo_url: logoUrl,
        changed_by: 'admin'
      };
      
      // Include cafe_id if provided
      if (cafeId) {
        updatedSettings.cafe_id = cafeId;
      }
      
      const result = await this.update(updatedSettings);
      console.log('[CafeSettings.updateLogo] Update successful', { cafeId, logoUrl });
      return result;
    } catch (error) {
      console.error('[CafeSettings.updateLogo] Error:', error);
      throw new Error(`Error updating logo: ${error.message}`);
    }
  }

  // Update hero image
  static async updateHeroImage(heroImageUrl, cafeId = null) {
    try {
      console.log('[CafeSettings.updateHeroImage] Starting update', { heroImageUrl, cafeId });
      const currentSettings = await this.getCurrent(cafeId);
      const updatedSettings = {
        ...currentSettings,
        hero_image_url: heroImageUrl,
        changed_by: 'admin'
      };
      
      // Include cafe_id if provided
      if (cafeId) {
        updatedSettings.cafe_id = cafeId;
      }
      
      const result = await this.update(updatedSettings);
      console.log('[CafeSettings.updateHeroImage] Update successful', { cafeId, heroImageUrl });
      return result;
    } catch (error) {
      console.error('[CafeSettings.updateHeroImage] Error:', error);
      throw new Error(`Error updating hero image: ${error.message}`);
    }
  }

  // Update promo banner image
  static async updatePromoBannerImage(promoBannerImageUrl, cafeId = null) {
    try {
      console.log('[CafeSettings.updatePromoBannerImage] Starting update', { promoBannerImageUrl, cafeId });
      const currentSettings = await this.getCurrent(cafeId);
      const updatedSettings = {
        ...currentSettings,
        promo_banner_image_url: promoBannerImageUrl,
        changed_by: 'admin'
      };
      
      // Include cafe_id if provided
      if (cafeId) {
        updatedSettings.cafe_id = cafeId;
      }
      
      const result = await this.update(updatedSettings);
      console.log('[CafeSettings.updatePromoBannerImage] Update successful', { cafeId, promoBannerImageUrl });
      return result;
    } catch (error) {
      console.error('[CafeSettings.updatePromoBannerImage] Error:', error);
      throw new Error(`Error updating promo banner image: ${error.message}`);
    }
  }
}

module.exports = CafeSettings; 