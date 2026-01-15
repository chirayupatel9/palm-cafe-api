const { pool } = require('../config/database');

class CafeSettings {
  // Get current cafe settings
  static async getCurrent() {
    try {
      // First, check which columns exist in the cafe_settings table
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'cafe_settings'
      `);
      
      const existingColumns = columns.map(col => col.COLUMN_NAME);
      
      // Build dynamic SELECT query based on existing columns
      const selectColumns = existingColumns.filter(col => 
        col !== 'id' && col !== 'is_active' && col !== 'created_at' && col !== 'updated_at'
      );
      
      if (selectColumns.length === 0) {
        // If no columns exist, return default settings
        return this.getDefaultSettings();
      }
      
      const [rows] = await pool.execute(`
        SELECT ${selectColumns.join(', ')}
        FROM cafe_settings 
        WHERE is_active = TRUE 
        ORDER BY created_at DESC 
        LIMIT 1
      `);

      if (rows.length === 0) {
        // Return default settings if no settings exist
        return this.getDefaultSettings();
      }

      return rows[0];
    } catch (error) {
      // If there's an error (e.g., table doesn't exist), return default settings
      console.warn('Error fetching cafe settings, returning defaults:', error.message);
      return this.getDefaultSettings();
    }
  }

  // Get default cafe settings
  static getDefaultSettings() {
    return {
      cafe_name: 'Palm Cafe',
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

      // Deactivate current settings
      await connection.execute('UPDATE cafe_settings SET is_active = FALSE');

      // Insert new settings with dynamic columns
      const insertQuery = `
        INSERT INTO cafe_settings (${insertColumns.join(', ')}) 
        VALUES (${insertPlaceholders.join(', ')})
      `;
      
      await connection.execute(insertQuery, insertValues);

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

      // Return the updated settings
      return await this.getCurrent();
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
  static async updateLogo(logoUrl) {
    try {
      const currentSettings = await this.getCurrent();
      const updatedSettings = {
        ...currentSettings,
        logo_url: logoUrl,
        changed_by: 'admin'
      };
      
      return await this.update(updatedSettings);
    } catch (error) {
      throw new Error(`Error updating logo: ${error.message}`);
    }
  }

  // Update hero image
  static async updateHeroImage(heroImageUrl) {
    try {
      const currentSettings = await this.getCurrent();
      const updatedSettings = {
        ...currentSettings,
        hero_image_url: heroImageUrl,
        changed_by: 'admin'
      };
      
      return await this.update(updatedSettings);
    } catch (error) {
      throw new Error(`Error updating hero image: ${error.message}`);
    }
  }

  // Update promo banner image
  static async updatePromoBannerImage(promoBannerImageUrl) {
    try {
      const currentSettings = await this.getCurrent();
      const updatedSettings = {
        ...currentSettings,
        promo_banner_image_url: promoBannerImageUrl,
        changed_by: 'admin'
      };
      
      return await this.update(updatedSettings);
    } catch (error) {
      throw new Error(`Error updating promo banner image: ${error.message}`);
    }
  }
}

module.exports = CafeSettings; 