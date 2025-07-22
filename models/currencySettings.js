const { pool } = require('../config/database');

class CurrencySettings {
  static async getCurrent() {
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM currency_settings WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1'
      );
      return rows[0] || { currency_code: 'INR', currency_symbol: '₹', currency_name: 'Indian Rupee' };
    } catch (error) {
      console.error('Error getting current currency settings:', error);
      throw error;
    }
  }

  static async update(settings) {
    try {
      // Deactivate all current settings
      await pool.execute('UPDATE currency_settings SET is_active = FALSE');
      
      // Insert new active setting
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

  static async getHistory() {
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM currency_settings ORDER BY created_at DESC'
      );
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