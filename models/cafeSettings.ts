import { pool } from '../config/database';
import logger from '../config/logger';
import { RowDataPacket } from 'mysql2';

export interface CafeSettingsRow {
  [key: string]: unknown;
  cafe_name?: string | null;
  logo_url?: string | null;
  hero_image_url?: string | null;
  promo_banner_image_url?: string | null;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  opening_hours?: string;
  description?: string;
  show_kitchen_tab?: boolean;
  show_customers_tab?: boolean;
  show_payment_methods_tab?: boolean;
  show_menu_tab?: boolean;
  show_inventory_tab?: boolean;
  show_history_tab?: boolean;
  show_menu_images?: boolean;
  chef_show_kitchen_tab?: boolean;
  chef_show_menu_tab?: boolean;
  chef_show_inventory_tab?: boolean;
  chef_show_history_tab?: boolean;
  chef_can_edit_orders?: boolean;
  chef_can_view_customers?: boolean;
  chef_can_view_payments?: boolean;
  reception_show_kitchen_tab?: boolean;
  reception_show_menu_tab?: boolean;
  reception_show_inventory_tab?: boolean;
  reception_show_history_tab?: boolean;
  reception_can_edit_orders?: boolean;
  reception_can_view_customers?: boolean;
  reception_can_view_payments?: boolean;
  reception_can_create_orders?: boolean;
  admin_can_access_settings?: boolean;
  admin_can_manage_users?: boolean;
  admin_can_view_reports?: boolean;
  admin_can_manage_inventory?: boolean;
  admin_can_manage_menu?: boolean;
  enable_thermal_printer?: boolean;
  default_printer_type?: string;
  printer_name?: string | null;
  printer_port?: string | null;
  printer_baud_rate?: number;
  auto_print_new_orders?: boolean;
  print_order_copies?: number;
  color_scheme?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  light_primary_color?: string;
  light_secondary_color?: string;
  light_accent_color?: string;
  light_background_color?: string;
  light_text_color?: string;
  light_surface_color?: string;
  dark_primary_color?: string;
  dark_secondary_color?: string;
  dark_accent_color?: string;
  dark_background_color?: string;
  dark_text_color?: string;
  dark_surface_color?: string;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
  cafe_id?: number;
  changed_by?: string;
}

const colorDefaults: Record<string, string> = {
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

class CafeSettings {
  static getDefaultSettings(): CafeSettingsRow {
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

  static async getCurrent(cafeId: number | null = null): Promise<CafeSettingsRow> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'cafe_settings'
      `);
      const existingColumns = (columns as RowDataPacket[]).map((col: RowDataPacket) => col.COLUMN_NAME as string);
      const hasCafeIdColumn = existingColumns.includes('cafe_id');

      const selectColumns = existingColumns.filter(
        (col) => col !== 'id' && col !== 'is_active' && col !== 'created_at' && col !== 'updated_at'
      );
      if (selectColumns.length === 0) {
        return this.getDefaultSettings();
      }

      let whereClause = 'WHERE is_active = TRUE';
      const queryParams: (number | null)[] = [];
      if (hasCafeIdColumn && cafeId) {
        whereClause += ' AND cafe_id = ?';
        queryParams.push(cafeId);
      } else if (hasCafeIdColumn && !cafeId) {
        if (process.env.NODE_ENV !== 'production') {
          logger.debug('cafe_id column exists but no cafeId provided to getCurrent() - returning default settings');
        }
        return this.getDefaultSettings();
      }

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT ${selectColumns.join(', ')}
        FROM cafe_settings
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT 1`,
        queryParams
      );
      if (rows.length === 0) {
        return this.getDefaultSettings();
      }

      const settings = rows[0] as CafeSettingsRow & { cafe_id?: number };
      if (hasCafeIdColumn && cafeId && settings.cafe_id && settings.cafe_id !== cafeId) {
        logger.error('CafeSettings.getCurrent cafe_id mismatch', { requested: cafeId, got: settings.cafe_id });
        logger.warn('CafeSettings.getCurrent returning default settings due to cafe_id mismatch');
        return this.getDefaultSettings();
      }
      return settings;
    } catch (error) {
      logger.warn('Error fetching cafe settings, returning defaults', {
        message: (error as Error).message
      });
      return this.getDefaultSettings();
    }
  }

  static async update(settingsData: CafeSettingsRow & { cafe_id?: number; changed_by?: string }): Promise<CafeSettingsRow> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [columns] = await connection.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'cafe_settings'
      `);
      const existingColumns = (columns as RowDataPacket[]).map((col: RowDataPacket) => col.COLUMN_NAME as string);

      const basicColumns = [
        'cafe_name',
        'logo_url',
        'address',
        'phone',
        'email',
        'website',
        'opening_hours',
        'description',
        'is_active',
        'created_at',
        'updated_at'
      ];
      const extendedColumns = [
        'hero_image_url',
        'promo_banner_image_url',
        'show_kitchen_tab',
        'show_customers_tab',
        'show_payment_methods_tab',
        'show_menu_tab',
        'show_inventory_tab',
        'show_history_tab',
        'show_menu_images',
        'chef_show_kitchen_tab',
        'chef_show_menu_tab',
        'chef_show_inventory_tab',
        'chef_show_history_tab',
        'chef_can_edit_orders',
        'chef_can_view_customers',
        'chef_can_view_payments',
        'reception_show_kitchen_tab',
        'reception_show_menu_tab',
        'reception_show_inventory_tab',
        'reception_show_history_tab',
        'reception_can_edit_orders',
        'reception_can_view_customers',
        'reception_can_view_payments',
        'reception_can_create_orders',
        'admin_can_access_settings',
        'admin_can_manage_users',
        'admin_can_view_reports',
        'admin_can_manage_inventory',
        'admin_can_manage_menu',
        'enable_thermal_printer',
        'default_printer_type',
        'printer_name',
        'printer_port',
        'printer_baud_rate',
        'auto_print_new_orders',
        'print_order_copies',
        'light_primary_color',
        'light_secondary_color',
        'light_accent_color',
        'light_background_color',
        'light_text_color',
        'light_surface_color',
        'dark_primary_color',
        'dark_secondary_color',
        'dark_accent_color',
        'dark_background_color',
        'dark_text_color',
        'dark_surface_color',
        'color_scheme',
        'primary_color',
        'secondary_color',
        'accent_color'
      ];

      const insertColumns: string[] = [];
      const insertValues: unknown[] = [];
      const insertPlaceholders: string[] = [];

      basicColumns.forEach((col) => {
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
            insertValues.push((settingsData as Record<string, unknown>)[col] || '');
          }
        }
      });

      extendedColumns.forEach((col) => {
        if (existingColumns.includes(col)) {
          insertColumns.push(col);
          insertPlaceholders.push('?');
          if (col === 'hero_image_url' || col === 'promo_banner_image_url') {
            insertValues.push((settingsData as Record<string, unknown>)[col] || null);
          } else if (
            col.includes('show_') ||
            col.includes('can_') ||
            col.includes('enable_') ||
            col.includes('auto_print_')
          ) {
            insertValues.push((settingsData as Record<string, unknown>)[col] !== false);
          } else if (col === 'default_printer_type') {
            insertValues.push((settingsData as Record<string, unknown>)[col] || 'system');
          } else if (col === 'printer_baud_rate') {
            insertValues.push((settingsData as Record<string, unknown>)[col] || 9600);
          } else if (col === 'print_order_copies') {
            insertValues.push((settingsData as Record<string, unknown>)[col] || 1);
          } else if (col.includes('_color')) {
            insertValues.push((settingsData as Record<string, unknown>)[col] || colorDefaults[col]);
          } else if (col === 'color_scheme') {
            insertValues.push((settingsData as Record<string, unknown>)[col] || 'default');
          } else {
            insertValues.push((settingsData as Record<string, unknown>)[col] || null);
          }
        }
      });

      if (existingColumns.includes('cafe_id') && settingsData.cafe_id) {
        insertColumns.push('cafe_id');
        insertPlaceholders.push('?');
        insertValues.push(settingsData.cafe_id);
        logger.debug('[CafeSettings.update] Including cafe_id in insert:', settingsData.cafe_id);
      }

      const hasCafeIdColumn = existingColumns.includes('cafe_id');
      let shouldUpdate = false;
      let existingSettingsId: number | null = null;

      if (hasCafeIdColumn && settingsData.cafe_id) {
        const [existing] = await connection.execute<RowDataPacket[]>(
          'SELECT id FROM cafe_settings WHERE cafe_id = ? ORDER BY is_active DESC, id DESC LIMIT 1',
          [settingsData.cafe_id]
        );
        if (existing.length > 0) {
          shouldUpdate = true;
          existingSettingsId = (existing[0] as { id: number }).id;
          logger.debug('[CafeSettings.update] Updating existing settings record ID:', existingSettingsId);
        } else {
          logger.debug('[CafeSettings.update] No settings row for cafe_id, creating new record');
        }
      } else if (!hasCafeIdColumn) {
        const [existing] = await connection.execute<RowDataPacket[]>(
          'SELECT id FROM cafe_settings WHERE is_active = TRUE LIMIT 1'
        );
        if (existing.length > 0) {
          shouldUpdate = true;
          existingSettingsId = (existing[0] as { id: number }).id;
          logger.debug('[CafeSettings.update] Updating existing settings record ID (legacy):', existingSettingsId);
        }
      }

      if (shouldUpdate && existingSettingsId) {
        const updateFields: string[] = [];
        const updateValues: unknown[] = [];
        insertColumns.forEach((col, index) => {
          if (
            col !== 'id' &&
            col !== 'is_active' &&
            col !== 'created_at' &&
            col !== 'updated_at' &&
            col !== 'cafe_id'
          ) {
            updateFields.push(`${col} = ?`);
            updateValues.push(insertValues[index]);
          }
        });
        if (existingColumns.includes('is_active')) {
          updateFields.push('is_active = TRUE');
        }
        if (existingColumns.includes('updated_at')) {
          updateFields.push('updated_at = NOW()');
        }
        if (updateFields.length > 0) {
          updateValues.push(existingSettingsId);
          const hasCafeIdInUpdate = hasCafeIdColumn && settingsData.cafe_id;
          if (hasCafeIdInUpdate && settingsData.cafe_id != null) {
            updateValues.push(settingsData.cafe_id);
            await connection.execute(
              'UPDATE cafe_settings SET is_active = FALSE WHERE cafe_id = ? AND id != ?',
              [settingsData.cafe_id, existingSettingsId]
            );
          }
          const updateQuery = hasCafeIdInUpdate
            ? `UPDATE cafe_settings SET ${updateFields.join(', ')} WHERE id = ? AND cafe_id = ?`
            : `UPDATE cafe_settings SET ${updateFields.join(', ')} WHERE id = ?`;
          await connection.execute(updateQuery, updateValues as (string | number | boolean | Date | null)[]);
        }
      } else {
        if (hasCafeIdColumn && settingsData.cafe_id) {
          await connection.execute('UPDATE cafe_settings SET is_active = FALSE WHERE cafe_id = ?', [
            settingsData.cafe_id
          ]);
        } else {
          await connection.execute('UPDATE cafe_settings SET is_active = FALSE');
        }
        await connection.execute(
          `INSERT INTO cafe_settings (${insertColumns.join(', ')}) VALUES (${insertPlaceholders.join(', ')})`,
          insertValues as (string | number | boolean | Date | null)[]
        );
      }

      const [historyColumns] = await connection.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'cafe_settings_history'
      `);
      const existingHistoryColumns = (historyColumns as RowDataPacket[]).map(
        (col: RowDataPacket) => col.COLUMN_NAME as string
      );
      const historyInsertColumns: string[] = [];
      const historyInsertValues: (string | number | boolean | Date | null)[] = [];
      const historyInsertPlaceholders: string[] = [];

      insertColumns.forEach((col) => {
        if (existingHistoryColumns.includes(col)) {
          historyInsertColumns.push(col);
          historyInsertPlaceholders.push('?');
          if (col === 'created_at' || col === 'updated_at') {
            historyInsertValues.push(new Date());
          } else {
            historyInsertValues.push(insertValues[insertColumns.indexOf(col)] as string | number | boolean | Date | null);
          }
        }
      });
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
      if (historyInsertColumns.length > 0) {
        await connection.execute(
          `INSERT INTO cafe_settings_history (${historyInsertColumns.join(', ')}) VALUES (${historyInsertPlaceholders.join(', ')})`,
          historyInsertValues as (string | number | boolean | Date | null)[]
        );
      }

      await connection.commit();
      const cafeId = settingsData.cafe_id || null;
      return await this.getCurrent(cafeId);
    } catch (error) {
      await connection.rollback();
      logger.error('Error in cafe settings update:', error);
      throw new Error(`Error updating cafe settings: ${(error as Error).message}`);
    } finally {
      connection.release();
    }
  }

  static async getHistory(): Promise<RowDataPacket[]> {
    try {
      const [tables] = await pool.execute<RowDataPacket[]>(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'cafe_settings_history'
      `);
      if (tables.length === 0) {
        logger.warn('cafe_settings_history table does not exist, returning empty array');
        return [];
      }
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM cafe_settings_history ORDER BY changed_at DESC LIMIT 20'
      );
      return rows;
    } catch (error) {
      logger.warn('Error fetching cafe settings history:', (error as Error).message);
      return [];
    }
  }

  static async updateLogo(logoUrl: string, cafeId: number | null = null): Promise<CafeSettingsRow> {
    try {
      logger.debug('[CafeSettings.updateLogo] Starting update', { logoUrl, cafeId });
      const currentSettings = await this.getCurrent(cafeId);
      const updatedSettings: CafeSettingsRow & { cafe_id?: number; changed_by?: string } = {
        ...currentSettings,
        logo_url: logoUrl,
        changed_by: 'admin'
      };
      if (cafeId) {
        updatedSettings.cafe_id = cafeId;
      }
      const result = await this.update(updatedSettings);
      logger.debug('[CafeSettings.updateLogo] Update successful', { cafeId, logoUrl });
      return result;
    } catch (error) {
      logger.error('[CafeSettings.updateLogo] Error:', error);
      throw new Error(`Error updating logo: ${(error as Error).message}`);
    }
  }

  static async updateHeroImage(heroImageUrl: string, cafeId: number | null = null): Promise<CafeSettingsRow> {
    try {
      logger.debug('[CafeSettings.updateHeroImage] Starting update', { heroImageUrl, cafeId });
      const currentSettings = await this.getCurrent(cafeId);
      const updatedSettings: CafeSettingsRow & { cafe_id?: number; changed_by?: string } = {
        ...currentSettings,
        hero_image_url: heroImageUrl,
        changed_by: 'admin'
      };
      if (cafeId) {
        updatedSettings.cafe_id = cafeId;
      }
      const result = await this.update(updatedSettings);
      logger.debug('[CafeSettings.updateHeroImage] Update successful', { cafeId, heroImageUrl });
      return result;
    } catch (error) {
      logger.error('[CafeSettings.updateHeroImage] Error:', error);
      throw new Error(`Error updating hero image: ${(error as Error).message}`);
    }
  }

  static async updatePromoBannerImage(
    promoBannerImageUrl: string,
    cafeId: number | null = null
  ): Promise<CafeSettingsRow> {
    try {
      logger.debug('[CafeSettings.updatePromoBannerImage] Starting update', { promoBannerImageUrl, cafeId });
      const currentSettings = await this.getCurrent(cafeId);
      const updatedSettings: CafeSettingsRow & { cafe_id?: number; changed_by?: string } = {
        ...currentSettings,
        promo_banner_image_url: promoBannerImageUrl,
        changed_by: 'admin'
      };
      if (cafeId) {
        updatedSettings.cafe_id = cafeId;
      }
      const result = await this.update(updatedSettings);
      logger.debug('[CafeSettings.updatePromoBannerImage] Update successful', { cafeId, promoBannerImageUrl });
      return result;
    } catch (error) {
      logger.error('[CafeSettings.updatePromoBannerImage] Error:', error);
      throw new Error(`Error updating promo banner image: ${(error as Error).message}`);
    }
  }
}

export default CafeSettings;
