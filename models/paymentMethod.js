const { pool } = require('../config/database');

class PaymentMethod {
  // Get all payment methods (filtered by cafeId if provided)
  static async getAll(cafeId = null) {
    try {
      // Check if cafe_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'payment_methods' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = columns.length > 0;
      
      let query = `
        SELECT 
          id, name, code, is_active, display_order, 
          description, icon, created_at, updated_at
        FROM payment_methods
        WHERE is_active = TRUE
      `;
      
      const params = [];
      
      if (hasCafeId && cafeId) {
        query += ' AND cafe_id = ?';
        params.push(cafeId);
      } else if (hasCafeId && !cafeId) {
        // If cafe_id column exists but no cafeId provided, return empty (cafe-specific required)
        return [];
      }
      
      query += ' ORDER BY display_order ASC, name ASC';
      
      const [rows] = await pool.execute(query, params);
      return rows;
    } catch (error) {
      throw new Error(`Error fetching payment methods: ${error.message}`);
    }
  }

  // Get all payment methods (including inactive - for admin, filtered by cafeId)
  static async getAllForAdmin(cafeId = null) {
    try {
      // Check if cafe_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'payment_methods' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = columns.length > 0;
      
      let query = `
        SELECT 
          id, name, code, is_active, display_order, 
          description, icon, created_at, updated_at
        FROM payment_methods
        WHERE 1=1
      `;
      
      const params = [];
      
      if (hasCafeId && cafeId) {
        query += ' AND cafe_id = ?';
        params.push(cafeId);
      } else if (hasCafeId && !cafeId) {
        // If cafe_id column exists but no cafeId provided, return empty (cafe-specific required)
        return [];
      }
      
      query += ' ORDER BY display_order ASC, name ASC';
      
      const [rows] = await pool.execute(query, params);
      return rows;
    } catch (error) {
      throw new Error(`Error fetching payment methods: ${error.message}`);
    }
  }

  // Get payment method by ID (optionally filtered by cafeId)
  static async getById(id, cafeId = null) {
    try {
      // Check if cafe_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'payment_methods' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = columns.length > 0;
      
      let query = `
        SELECT 
          id, name, code, is_active, display_order, 
          description, icon, created_at, updated_at
        FROM payment_methods
        WHERE id = ?
      `;
      
      const params = [id];
      
      if (hasCafeId && cafeId) {
        query += ' AND cafe_id = ?';
        params.push(cafeId);
      }
      
      const [rows] = await pool.execute(query, params);

      if (rows.length === 0) {
        return null;
      }

      return rows[0];
    } catch (error) {
      throw new Error(`Error fetching payment method: ${error.message}`);
    }
  }

  // Get payment method by code (optionally filtered by cafeId)
  static async getByCode(code, cafeId = null) {
    try {
      // Check if cafe_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'payment_methods' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = columns.length > 0;
      
      let query = `
        SELECT 
          id, name, code, is_active, display_order, 
          description, icon, created_at, updated_at
        FROM payment_methods
        WHERE code = ? AND is_active = TRUE
      `;
      
      const params = [code];
      
      if (hasCafeId && cafeId) {
        query += ' AND cafe_id = ?';
        params.push(cafeId);
      }
      
      const [rows] = await pool.execute(query, params);

      if (rows.length === 0) {
        return null;
      }

      return rows[0];
    } catch (error) {
      throw new Error(`Error fetching payment method: ${error.message}`);
    }
  }

  // Create new payment method
  static async create(paymentMethodData) {
    try {
      const {
        name, code, description, icon, display_order, is_active = true, cafe_id
      } = paymentMethodData;

      // Check if cafe_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'payment_methods' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = columns.length > 0;

      // Check if code already exists for this cafe
      if (hasCafeId && cafe_id) {
        const existing = await this.getByCode(code, cafe_id);
        if (existing) {
          throw new Error('Payment method code already exists for this cafe');
        }
      } else {
        const existing = await this.getByCode(code);
        if (existing) {
          throw new Error('Payment method code already exists');
        }
      }

      let query, params;
      if (hasCafeId && cafe_id) {
        query = `
          INSERT INTO payment_methods (name, code, description, icon, display_order, is_active, cafe_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        params = [name, code, description, icon, display_order || 0, is_active, cafe_id];
      } else {
        query = `
          INSERT INTO payment_methods (name, code, description, icon, display_order, is_active)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        params = [name, code, description, icon, display_order || 0, is_active];
      }

      const [result] = await pool.execute(query, params);
      return await this.getById(result.insertId);
    } catch (error) {
      throw new Error(`Error creating payment method: ${error.message}`);
    }
  }

  // Update payment method
  static async update(id, paymentMethodData) {
    try {
      const {
        name, code, description, icon, display_order, is_active
      } = paymentMethodData;

      // Check if code already exists for other payment methods
      if (code) {
        const existing = await this.getByCode(code);
        if (existing && existing.id !== parseInt(id)) {
          throw new Error('Payment method code already exists');
        }
      }

      const [result] = await pool.execute(`
        UPDATE payment_methods 
        SET name = ?, code = ?, description = ?, icon = ?, 
            display_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [name, code, description, icon, display_order, is_active, id]);

      if (result.affectedRows === 0) {
        throw new Error('Payment method not found');
      }

      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error updating payment method: ${error.message}`);
    }
  }

  // Delete payment method
  static async delete(id) {
    try {
      const [result] = await pool.execute(`
        DELETE FROM payment_methods WHERE id = ?
      `, [id]);

      if (result.affectedRows === 0) {
        throw new Error('Payment method not found');
      }

      return { success: true, message: 'Payment method deleted successfully' };
    } catch (error) {
      throw new Error(`Error deleting payment method: ${error.message}`);
    }
  }

  // Toggle payment method status
  static async toggleStatus(id) {
    try {
      const paymentMethod = await this.getById(id);
      if (!paymentMethod) {
        throw new Error('Payment method not found');
      }

      const newStatus = !paymentMethod.is_active;
      const [result] = await pool.execute(`
        UPDATE payment_methods 
        SET is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [newStatus, id]);

      if (result.affectedRows === 0) {
        throw new Error('Payment method not found');
      }

      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error toggling payment method status: ${error.message}`);
    }
  }

  // Reorder payment methods
  static async reorder(orderedIds) {
    try {
      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        for (let i = 0; i < orderedIds.length; i++) {
          await connection.execute(`
            UPDATE payment_methods 
            SET display_order = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [i + 1, orderedIds[i]]);
        }

        await connection.commit();
        return { success: true, message: 'Payment methods reordered successfully' };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      throw new Error(`Error reordering payment methods: ${error.message}`);
    }
  }

  // Get default payment methods
  static async getDefaults() {
    return [
      {
        name: 'Cash',
        code: 'cash',
        description: 'Pay with cash',
        icon: '💵',
        display_order: 1,
        is_active: true
      },
      {
        name: 'UPI',
        code: 'upi',
        description: 'Pay using UPI',
        icon: '📱',
        display_order: 2,
        is_active: true
      }
    ];
  }

  // Initialize default payment methods
  static async initializeDefaults() {
    try {
      const defaults = await this.getDefaults();
      const existing = await this.getAll();

      if (existing.length === 0) {
        for (const defaultMethod of defaults) {
          await this.create(defaultMethod);
        }
      }
    } catch (error) {
      console.error('Error initializing default payment methods:', error);
    }
  }
}

module.exports = PaymentMethod; 