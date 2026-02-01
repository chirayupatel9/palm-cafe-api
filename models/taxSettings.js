const { pool } = require('../config/database');

// In-memory cache for getCurrent to reduce DB load on order creation (TTL 60s), keyed by cafeId
const TAX_CACHE_TTL_MS = 60000;
const taxCacheByCafe = {};
const taxCacheExpiryByCafe = {};

class TaxSettings {
  // Get current tax settings (cached 60s). Optional cafeId for multi-cafe; when provided, scope by cafe_id.
  static async getCurrent(cafeId = null) {
    const cacheKey = cafeId != null ? String(cafeId) : '_global';
    if (taxCacheByCafe[cacheKey] && Date.now() < (taxCacheExpiryByCafe[cacheKey] || 0)) {
      return taxCacheByCafe[cacheKey];
    }
    try {
      let sql = 'SELECT id, tax_rate, tax_name, is_active, show_tax_in_menu, include_tax FROM tax_settings WHERE is_active = TRUE';
      const params = [];
      if (cafeId != null) {
        sql += ' AND cafe_id = ?';
        params.push(cafeId);
      }
      sql += ' ORDER BY id DESC LIMIT 1';
      const [rows] = await pool.execute(sql, params);

      let result;
      if (rows.length === 0) {
        result = {
          id: 1,
          tax_rate: 0.00,
          tax_name: 'Tax',
          is_active: true,
          show_tax_in_menu: true,
          include_tax: true
        };
      } else {
        result = {
          ...rows[0],
          tax_rate: parseFloat(rows[0].tax_rate),
          show_tax_in_menu: Boolean(rows[0].show_tax_in_menu),
          include_tax: Boolean(rows[0].include_tax)
        };
      }
      taxCacheByCafe[cacheKey] = result;
      taxCacheExpiryByCafe[cacheKey] = Date.now() + TAX_CACHE_TTL_MS;
      return result;
    } catch (error) {
      throw new Error(`Error fetching tax settings: ${error.message}`);
    }
  }

  // Update tax settings. Optional cafeId; when provided, only deactivate/insert for that cafe.
  static async update(taxData, cafeId = null) {
    try {
      if (cafeId != null) {
        taxCacheByCafe[String(cafeId)] = null;
        taxCacheExpiryByCafe[String(cafeId)] = 0;
      } else {
        Object.keys(taxCacheByCafe).forEach(k => { taxCacheByCafe[k] = null; taxCacheExpiryByCafe[k] = 0; });
      }
      const { tax_rate, tax_name, show_tax_in_menu = true, include_tax = true } = taxData;

      if (cafeId != null) {
        await pool.execute('UPDATE tax_settings SET is_active = FALSE WHERE cafe_id = ?', [cafeId]);
        const [result] = await pool.execute(
          'INSERT INTO tax_settings (cafe_id, tax_rate, tax_name, is_active, show_tax_in_menu, include_tax) VALUES (?, ?, ?, TRUE, ?, ?)',
          [cafeId, tax_rate, tax_name, show_tax_in_menu, include_tax]
        );
        return {
          id: result.insertId,
          tax_rate: parseFloat(tax_rate),
          tax_name,
          is_active: true,
          show_tax_in_menu: Boolean(show_tax_in_menu),
          include_tax: Boolean(include_tax)
        };
      }

      await pool.execute('UPDATE tax_settings SET is_active = FALSE');
      const [result] = await pool.execute(
        'INSERT INTO tax_settings (tax_rate, tax_name, is_active, show_tax_in_menu, include_tax) VALUES (?, ?, TRUE, ?, ?)',
        [tax_rate, tax_name, show_tax_in_menu, include_tax]
      );
      return {
        id: result.insertId,
        tax_rate: parseFloat(tax_rate),
        tax_name,
        is_active: true,
        show_tax_in_menu: Boolean(show_tax_in_menu),
        include_tax: Boolean(include_tax)
      };
    } catch (error) {
      throw new Error(`Error updating tax settings: ${error.message}`);
    }
  }

  // Get tax history. Optional cafeId; when provided, filter by cafe_id.
  static async getHistory(cafeId = null) {
    try {
      let sql = 'SELECT id, tax_rate, tax_name, is_active, show_tax_in_menu, include_tax, created_at FROM tax_settings';
      const params = [];
      if (cafeId != null) {
        sql += ' WHERE cafe_id = ?';
        params.push(cafeId);
      }
      sql += ' ORDER BY created_at DESC';
      const [rows] = await pool.execute(sql, params);

      return rows.map(row => ({
        ...row,
        tax_rate: parseFloat(row.tax_rate),
        show_tax_in_menu: Boolean(row.show_tax_in_menu),
        include_tax: Boolean(row.include_tax)
      }));
    } catch (error) {
      throw new Error(`Error fetching tax history: ${error.message}`);
    }
  }

  // Calculate tax amount. Optional cafeId for multi-cafe.
  static async calculateTax(subtotal, cafeId = null) {
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
      throw new Error(`Error calculating tax: ${error.message}`);
    }
  }
}

module.exports = TaxSettings; 