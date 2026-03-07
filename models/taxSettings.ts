import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';

const TAX_CACHE_TTL_MS = 60000;
const taxCacheByCafe: Record<string, TaxSettingsRow | null> = {};
const taxCacheExpiryByCafe: Record<string, number> = {};

export interface TaxSettingsRow {
  id: number;
  tax_rate: number;
  tax_name: string;
  is_active: boolean;
  show_tax_in_menu: boolean;
  include_tax: boolean;
}

export interface TaxUpdateData {
  tax_rate: number;
  tax_name?: string;
  show_tax_in_menu?: boolean;
  include_tax?: boolean;
}

class TaxSettings {
  static async getCurrent(cafeId: number | null = null): Promise<TaxSettingsRow> {
    const cacheKey = cafeId != null ? String(cafeId) : '_global';
    if (taxCacheByCafe[cacheKey] && Date.now() < (taxCacheExpiryByCafe[cacheKey] || 0)) {
      return taxCacheByCafe[cacheKey]!;
    }
    try {
      let sql =
        'SELECT id, tax_rate, tax_name, is_active, show_tax_in_menu, include_tax FROM tax_settings WHERE is_active = TRUE';
      const params: number[] = [];
      if (cafeId != null) {
        sql += ' AND cafe_id = ?';
        params.push(cafeId);
      }
      sql += ' ORDER BY id DESC LIMIT 1';
      const [rows] = await pool.execute<RowDataPacket[]>(sql, params);

      let result: TaxSettingsRow;
      if (rows.length === 0) {
        result = {
          id: 1,
          tax_rate: 0,
          tax_name: 'Tax',
          is_active: true,
          show_tax_in_menu: true,
          include_tax: true
        };
      } else {
        const r = rows[0] as RowDataPacket;
        result = {
          ...r,
          tax_rate: parseFloat(String(r.tax_rate)),
          show_tax_in_menu: Boolean(r.show_tax_in_menu),
          include_tax: Boolean(r.include_tax)
        } as TaxSettingsRow;
      }
      taxCacheByCafe[cacheKey] = result;
      taxCacheExpiryByCafe[cacheKey] = Date.now() + TAX_CACHE_TTL_MS;
      return result;
    } catch (error) {
      throw new Error(`Error fetching tax settings: ${(error as Error).message}`);
    }
  }

  static async update(taxData: TaxUpdateData, cafeId: number | null = null): Promise<TaxSettingsRow> {
    try {
      if (cafeId != null) {
        taxCacheByCafe[String(cafeId)] = null;
        taxCacheExpiryByCafe[String(cafeId)] = 0;
      } else {
        Object.keys(taxCacheByCafe).forEach((k) => {
          taxCacheByCafe[k] = null;
          taxCacheExpiryByCafe[k] = 0;
        });
      }
      const {
        tax_rate,
        tax_name = 'Tax',
        show_tax_in_menu = true,
        include_tax = true
      } = taxData;

      if (cafeId != null) {
        await pool.execute('UPDATE tax_settings SET is_active = FALSE WHERE cafe_id = ?', [cafeId]);
        const [result] = await pool.execute<RowDataPacket[] & { insertId: number }>(
          'INSERT INTO tax_settings (cafe_id, tax_rate, tax_name, is_active, show_tax_in_menu, include_tax) VALUES (?, ?, ?, TRUE, ?, ?)',
          [cafeId, tax_rate, tax_name, show_tax_in_menu, include_tax]
        );
        return {
          id: result.insertId,
          tax_rate: parseFloat(String(tax_rate)),
          tax_name,
          is_active: true,
          show_tax_in_menu: Boolean(show_tax_in_menu),
          include_tax: Boolean(include_tax)
        };
      }

      await pool.execute('UPDATE tax_settings SET is_active = FALSE');
      const [result] = await pool.execute<RowDataPacket[] & { insertId: number }>(
        'INSERT INTO tax_settings (tax_rate, tax_name, is_active, show_tax_in_menu, include_tax) VALUES (?, ?, TRUE, ?, ?)',
        [tax_rate, tax_name, show_tax_in_menu, include_tax]
      );
      return {
        id: result.insertId,
        tax_rate: parseFloat(String(tax_rate)),
        tax_name,
        is_active: true,
        show_tax_in_menu: Boolean(show_tax_in_menu),
        include_tax: Boolean(include_tax)
      };
    } catch (error) {
      throw new Error(`Error updating tax settings: ${(error as Error).message}`);
    }
  }

  static async getHistory(cafeId: number | null = null): Promise<TaxSettingsRow[]> {
    try {
      let sql =
        'SELECT id, tax_rate, tax_name, is_active, show_tax_in_menu, include_tax, created_at FROM tax_settings';
      const params: number[] = [];
      if (cafeId != null) {
        sql += ' WHERE cafe_id = ?';
        params.push(cafeId);
      }
      sql += ' ORDER BY created_at DESC';
      const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
      return (rows as RowDataPacket[]).map((row: RowDataPacket) => ({
        ...row,
        tax_rate: parseFloat(String(row.tax_rate)),
        show_tax_in_menu: Boolean(row.show_tax_in_menu),
        include_tax: Boolean(row.include_tax)
      })) as TaxSettingsRow[];
    } catch (error) {
      throw new Error(`Error fetching tax history: ${(error as Error).message}`);
    }
  }

  static async calculateTax(
    subtotal: number,
    cafeId: number | null = null
  ): Promise<{ taxRate: number; taxName: string; taxAmount: number }> {
    try {
      const settings = await this.getCurrent(cafeId);
      if (!settings.include_tax) {
        return {
          taxRate: settings.tax_rate,
          taxName: settings.tax_name,
          taxAmount: 0
        };
      }
      const taxAmount = (subtotal * settings.tax_rate) / 100;
      return {
        taxRate: settings.tax_rate,
        taxName: settings.tax_name,
        taxAmount: parseFloat(taxAmount.toFixed(2))
      };
    } catch (error) {
      throw new Error(`Error calculating tax: ${(error as Error).message}`);
    }
  }
}

export default TaxSettings;
