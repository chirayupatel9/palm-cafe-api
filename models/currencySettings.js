const { pool } = require('../config/database');

class CurrencySettings {
  // Optional cafeId for multi-cafe; when provided, scope by cafe_id.
  static async getCurrent(cafeId = null) {
    try {
      let sql = 'SELECT * FROM currency_settings WHERE is_active = TRUE';
      const params = [];
      if (cafeId != null) {
        sql += ' AND cafe_id = ?';
        params.push(cafeId);
      }
      sql += ' ORDER BY created_at DESC LIMIT 1';
      const [rows] = await pool.execute(sql, params);
      return rows[0] || { currency_code: 'INR', currency_symbol: '₹', currency_name: 'Indian Rupee' };
    } catch (error) {
      console.error('Error getting current currency settings:', error);
      throw error;
    }
  }

  // Optional cafeId; when provided, only deactivate/insert for that cafe.
  static async update(settings, cafeId = null) {
    try {
      if (cafeId != null) {
        await pool.execute('UPDATE currency_settings SET is_active = FALSE WHERE cafe_id = ?', [cafeId]);
        const [result] = await pool.execute(
          'INSERT INTO currency_settings (cafe_id, currency_code, currency_symbol, currency_name, is_active) VALUES (?, ?, ?, ?, TRUE)',
          [cafeId, settings.currency_code, settings.currency_symbol, settings.currency_name]
        );
        return { id: result.insertId, ...settings, is_active: true };
      }

      await pool.execute('UPDATE currency_settings SET is_active = FALSE');
      const [result] = await pool.execute(
        'INSERT INTO currency_settings (currency_code, currency_symbol, currency_name, is_active) VALUES (?, ?, ?, TRUE)',
        [settings.currency_code, settings.currency_symbol, settings.currency_name]
      );
      return { id: result.insertId, ...settings, is_active: true };
    } catch (error) {
      console.error('Error updating currency settings:', error);
      throw error;
    }
  }

  // Optional cafeId; when provided, filter by cafe_id.
  static async getHistory(cafeId = null) {
    try {
      let sql = 'SELECT * FROM currency_settings';
      const params = [];
      if (cafeId != null) {
        sql += ' WHERE cafe_id = ?';
        params.push(cafeId);
      }
      sql += ' ORDER BY created_at DESC';
      const [rows] = await pool.execute(sql, params);
      return rows;
    } catch (error) {
      console.error('Error getting currency history:', error);
      throw error;
    }
  }

  static async getAvailableCurrencies() {
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

module.exports = CurrencySettings; 