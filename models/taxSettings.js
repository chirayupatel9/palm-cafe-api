const { pool } = require('../config/database');

class TaxSettings {
  // Get current tax settings
  static async getCurrent() {
    try {
      const [rows] = await pool.execute(
        'SELECT id, tax_rate, tax_name, is_active, show_tax_in_menu, include_tax FROM tax_settings WHERE is_active = TRUE ORDER BY id DESC LIMIT 1'
      );
      
      if (rows.length === 0) {
        // Return default settings if none exist
        return {
          id: 1,
          tax_rate: 0.00,
          tax_name: 'Tax',
          is_active: true,
          show_tax_in_menu: true,
          include_tax: true
        };
      }
      
      return {
        ...rows[0],
        tax_rate: parseFloat(rows[0].tax_rate),
        show_tax_in_menu: Boolean(rows[0].show_tax_in_menu),
        include_tax: Boolean(rows[0].include_tax)
      };
    } catch (error) {
      throw new Error(`Error fetching tax settings: ${error.message}`);
    }
  }

  // Update tax settings
  static async update(taxData) {
    try {
      const { tax_rate, tax_name, show_tax_in_menu = true, include_tax = true } = taxData;
      
      // Deactivate all current settings
      await pool.execute('UPDATE tax_settings SET is_active = FALSE');
      
      // Insert new setting
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

  // Get tax history
  static async getHistory() {
    try {
      const [rows] = await pool.execute(
        'SELECT id, tax_rate, tax_name, is_active, show_tax_in_menu, include_tax, created_at FROM tax_settings ORDER BY created_at DESC'
      );
      
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

  // Calculate tax amount
  static async calculateTax(subtotal) {
    try {
      const settings = await this.getCurrent();
      
      // If include_tax is false, return zero tax
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