import { pool } from '../config/database';
import logger from '../config/logger';
import { RowDataPacket } from 'mysql2';

export interface CurrencySettingsRow {
  id?: number;
  currency_code: string;
  currency_symbol: string;
  currency_name: string;
  is_active?: boolean;
  created_at?: Date;
}

export interface CurrencyUpdateData {
  currency_code: string;
  currency_symbol: string;
  currency_name: string;
}

export interface AvailableCurrency {
  code: string;
  symbol: string;
  name: string;
}

class CurrencySettings {
  static async getCurrent(cafeId: number | null = null): Promise<CurrencySettingsRow> {
    try {
      let sql = 'SELECT * FROM currency_settings WHERE is_active = TRUE';
      const params: number[] = [];
      if (cafeId != null) {
        sql += ' AND cafe_id = ?';
        params.push(cafeId);
      }
      sql += ' ORDER BY created_at DESC LIMIT 1';
      const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
      return (rows[0] as CurrencySettingsRow) || {
        currency_code: 'INR',
        currency_symbol: '₹',
        currency_name: 'Indian Rupee'
      };
    } catch (error) {
      logger.error('Error getting current currency settings', {
        message: (error as Error).message
      });
      throw error;
    }
  }

  static async update(
    settings: CurrencyUpdateData,
    cafeId: number | null = null
  ): Promise<CurrencySettingsRow & { id: number }> {
    try {
      if (cafeId != null) {
        await pool.execute('UPDATE currency_settings SET is_active = FALSE WHERE cafe_id = ?', [
          cafeId
        ]);
        const [result] = await pool.execute<RowDataPacket[] & { insertId: number }>(
          'INSERT INTO currency_settings (cafe_id, currency_code, currency_symbol, currency_name, is_active) VALUES (?, ?, ?, ?, TRUE)',
          [cafeId, settings.currency_code, settings.currency_symbol, settings.currency_name]
        );
        return { id: result.insertId, ...settings, is_active: true };
      }

      await pool.execute('UPDATE currency_settings SET is_active = FALSE');
      const [result] = await pool.execute<RowDataPacket[] & { insertId: number }>(
        'INSERT INTO currency_settings (currency_code, currency_symbol, currency_name, is_active) VALUES (?, ?, ?, TRUE)',
        [settings.currency_code, settings.currency_symbol, settings.currency_name]
      );
      return { id: result.insertId, ...settings, is_active: true };
    } catch (error) {
      logger.error('Error updating currency settings', { message: (error as Error).message });
      throw error;
    }
  }

  static async getHistory(cafeId: number | null = null): Promise<RowDataPacket[]> {
    try {
      let sql = 'SELECT * FROM currency_settings';
      const params: number[] = [];
      if (cafeId != null) {
        sql += ' WHERE cafe_id = ?';
        params.push(cafeId);
      }
      sql += ' ORDER BY created_at DESC';
      const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
      return rows;
    } catch (error) {
      logger.error('Error getting currency history', { message: (error as Error).message });
      throw error;
    }
  }

  static async getAvailableCurrencies(): Promise<AvailableCurrency[]> {
    return [
      { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
      { code: 'USD', symbol: '$', name: 'US Dollar' },
      { code: 'EUR', symbol: '€', name: 'Euro' },
      { code: 'GBP', symbol: '£', name: 'British Pound' },
      { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
      { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
      { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
      { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
      { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
      { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' }
    ];
  }
}

export default CurrencySettings;
