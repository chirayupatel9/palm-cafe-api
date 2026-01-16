const { pool } = require('../config/database');

class Customer {
  // Get all customers (optionally filtered by cafe_id)
  static async getAll(cafeId = null) {
    try {
      // Check if cafe_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'customers' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = columns.length > 0;
      
      // Build WHERE clause
      let whereClause = '';
      const params = [];
      
      if (hasCafeId && cafeId) {
        whereClause = 'WHERE cafe_id = ?';
        params.push(cafeId);
      } else if (hasCafeId && !cafeId) {
        // If cafe_id column exists but no cafeId provided, return empty array
        return [];
      }
      
      const [rows] = await pool.execute(`
        SELECT 
          id, name, email, phone, address, date_of_birth,
          loyalty_points, total_spent, visit_count,
          first_visit_date, last_visit_date, is_active, notes,
          created_at, updated_at
        FROM customers
        ${whereClause}
        ORDER BY name ASC
      `, params);

      return rows.map(customer => ({
        ...customer,
        loyalty_points: parseInt(customer.loyalty_points) || 0,
        total_spent: parseFloat(customer.total_spent) || 0,
        visit_count: parseInt(customer.visit_count) || 0
      }));
    } catch (error) {
      throw new Error(`Error fetching customers: ${error.message}`);
    }
  }

  // Get customer by ID
  static async getById(id) {
    try {
      const [rows] = await pool.execute(`
        SELECT 
          id, name, email, phone, address, date_of_birth,
          loyalty_points, total_spent, visit_count,
          first_visit_date, last_visit_date, is_active, notes,
          created_at, updated_at
        FROM customers
        WHERE id = ?
      `, [id]);

      if (rows.length === 0) {
        return null;
      }

      const customer = rows[0];
      return {
        ...customer,
        loyalty_points: parseInt(customer.loyalty_points),
        total_spent: parseFloat(customer.total_spent),
        visit_count: parseInt(customer.visit_count)
      };
    } catch (error) {
      throw new Error(`Error fetching customer: ${error.message}`);
    }
  }

  // Get customer by email or phone (optionally filtered by cafe_id)
  static async findByEmailOrPhone(email, phone, cafeId = null) {
    try {
      // Check if cafe_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'customers' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = columns.length > 0;
      
      let whereClause = 'WHERE (email = ? OR phone = ?)';
      const params = [email, phone];
      
      // If cafe_id column exists and cafeId is provided, scope to that cafe
      if (hasCafeId && cafeId) {
        whereClause += ' AND cafe_id = ?';
        params.push(cafeId);
      } else if (hasCafeId && !cafeId) {
        // If cafe_id column exists but no cafeId provided, return null
        // (prevents cross-cafe customer lookups)
        return null;
      }
      
      const [rows] = await pool.execute(`
        SELECT 
          id, name, email, phone, address, date_of_birth,
          loyalty_points, total_spent, visit_count,
          first_visit_date, last_visit_date, is_active, notes,
          created_at, updated_at
        FROM customers
        ${whereClause}
        LIMIT 1
      `, params);

      if (rows.length === 0) {
        return null;
      }

      const customer = rows[0];
      return {
        ...customer,
        loyalty_points: parseInt(customer.loyalty_points) || 0,
        total_spent: parseFloat(customer.total_spent) || 0,
        visit_count: parseInt(customer.visit_count) || 0
      };
    } catch (error) {
      throw new Error(`Error finding customer: ${error.message}`);
    }
  }

  // Create new customer
  static async create(customerData) {
    try {
      // Check if cafe_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'customers' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = columns.length > 0;
      
      const {
        name, email, phone, address, date_of_birth, notes, cafe_id
      } = customerData;

      let query, params;
      
      if (hasCafeId) {
        // If cafe_id column exists, include it in the insert
        if (!cafe_id) {
          throw new Error('cafe_id is required when creating a customer');
        }
        query = `
          INSERT INTO customers (name, email, phone, address, date_of_birth, notes, cafe_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        params = [name, email, phone, address, date_of_birth, notes, cafe_id];
      } else {
        // Legacy: no cafe_id column
        query = `
          INSERT INTO customers (name, email, phone, address, date_of_birth, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        params = [name, email, phone, address, date_of_birth, notes];
      }

      const [result] = await pool.execute(query, params);

      return await this.getById(result.insertId);
    } catch (error) {
      throw new Error(`Error creating customer: ${error.message}`);
    }
  }

  // Update customer
  static async update(id, customerData) {
    try {
      const {
        name, email, phone, address, date_of_birth, notes, is_active
      } = customerData;

      const [result] = await pool.execute(`
        UPDATE customers 
        SET name = ?, email = ?, phone = ?, address = ?, 
            date_of_birth = ?, notes = ?, is_active = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [name, email, phone, address, date_of_birth, notes, is_active, id]);

      if (result.affectedRows === 0) {
        throw new Error('Customer not found');
      }

      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error updating customer: ${error.message}`);
    }
  }

  // Update customer loyalty points and visit data
  static async updateLoyaltyData(id, orderAmount, pointsChange = null) {
    try {
      let pointsToAdd;
      
      if (pointsChange !== null) {
        // Use provided points change (for redemption scenarios)
        pointsToAdd = pointsChange;
      } else {
        // Calculate loyalty points (1 point per 10 rupees spent)
        pointsToAdd = Math.floor(orderAmount / 10);
      }
      
      const [result] = await pool.execute(`
        UPDATE customers 
        SET loyalty_points = loyalty_points + ?,
            total_spent = total_spent + ?,
            visit_count = visit_count + 1,
            last_visit_date = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [pointsToAdd, orderAmount, id]);

      if (result.affectedRows === 0) {
        throw new Error('Customer not found');
      }

      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error updating customer loyalty data: ${error.message}`);
    }
  }

  // Get customer order history
  static async getOrderHistory(customerId) {
    try {
      const [rows] = await pool.execute(`
        SELECT 
          o.id, o.order_number, o.total_amount, o.final_amount,
          o.status, o.payment_method, o.created_at,
          oi.quantity, oi.unit_price, oi.total_price,
          mi.name as item_name
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.customer_id = ?
        ORDER BY o.created_at DESC
      `, [customerId]);

      // Group orders with their items
      const orderMap = new Map();
      rows.forEach(row => {
        if (!orderMap.has(row.id)) {
          orderMap.set(row.id, {
            id: row.id,
            order_number: row.order_number,
            total_amount: parseFloat(row.total_amount),
            final_amount: parseFloat(row.final_amount),
            status: row.status,
            payment_method: row.payment_method,
            created_at: row.created_at,
            items: []
          });
        }
        
        if (row.item_name) {
          orderMap.get(row.id).items.push({
            name: row.item_name,
            quantity: row.quantity,
            unit_price: parseFloat(row.unit_price),
            total_price: parseFloat(row.total_price)
          });
        }
      });

      return Array.from(orderMap.values());
    } catch (error) {
      throw new Error(`Error fetching customer order history: ${error.message}`);
    }
  }

  // Search customers by name, email, or phone (optionally filtered by cafe_id)
  static async search(query, cafeId = null) {
    try {
      // Check if cafe_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'customers' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = columns.length > 0;
      
      const searchQuery = `%${query}%`;
      let whereClause = 'WHERE (name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      const params = [searchQuery, searchQuery, searchQuery];
      
      if (hasCafeId && cafeId) {
        whereClause += ' AND cafe_id = ?';
        params.push(cafeId);
      } else if (hasCafeId && !cafeId) {
        // If cafe_id column exists but no cafeId provided, return empty array
        return [];
      }
      
      const [rows] = await pool.execute(`
        SELECT 
          id, name, email, phone, address, date_of_birth,
          loyalty_points, total_spent, visit_count,
          first_visit_date, last_visit_date, is_active, notes,
          created_at, updated_at
        FROM customers
        ${whereClause}
        ORDER BY name ASC
      `, params);

      return rows.map(customer => ({
        ...customer,
        loyalty_points: parseInt(customer.loyalty_points) || 0,
        total_spent: parseFloat(customer.total_spent) || 0,
        visit_count: parseInt(customer.visit_count) || 0
      }));
    } catch (error) {
      throw new Error(`Error searching customers: ${error.message}`);
    }
  }

  // Get customer statistics
  static async getStatistics(cafeId = null) {
    try {
      // Check if cafe_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'customers' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = columns.length > 0;
      
      // Build WHERE clause
      let whereClause = '';
      const params = [];
      
      if (hasCafeId && cafeId) {
        whereClause = 'WHERE cafe_id = ?';
        params.push(cafeId);
      } else if (hasCafeId && !cafeId) {
        // If cafe_id column exists but no cafeId provided, return empty stats
        return {
          totalCustomers: 0,
          activeCustomers: 0,
          totalLoyaltyPoints: 0,
          totalSpent: 0,
          averageSpent: 0,
          topCustomers: []
        };
      }
      
      const [totalCustomers] = await pool.execute(
        `SELECT COUNT(*) as count FROM customers ${whereClause}`,
        params
      );
      
      const activeWhereClause = hasCafeId && cafeId 
        ? 'WHERE cafe_id = ? AND is_active = TRUE'
        : hasCafeId && !cafeId
        ? 'WHERE 1=0' // Return 0 if cafe_id required but not provided
        : 'WHERE is_active = TRUE';
      
      const [activeCustomers] = await pool.execute(
        `SELECT COUNT(*) as count FROM customers ${activeWhereClause}`,
        params
      );
      
      const [totalLoyaltyPoints] = await pool.execute(
        `SELECT SUM(loyalty_points) as total FROM customers ${whereClause}`,
        params
      );
      
      const [totalSpent] = await pool.execute(
        `SELECT SUM(total_spent) as total FROM customers ${whereClause}`,
        params
      );
      
      const [avgSpent] = await pool.execute(
        `SELECT AVG(total_spent) as average FROM customers ${whereClause}`,
        params
      );
      
      const topCustomersQuery = hasCafeId && cafeId
        ? `SELECT name, total_spent, loyalty_points, visit_count
           FROM customers
           WHERE cafe_id = ?
           ORDER BY total_spent DESC
           LIMIT 5`
        : hasCafeId && !cafeId
        ? `SELECT name, total_spent, loyalty_points, visit_count
           FROM customers
           WHERE 1=0
           LIMIT 5`
        : `SELECT name, total_spent, loyalty_points, visit_count
           FROM customers
           ORDER BY total_spent DESC
           LIMIT 5`;
      
      const [topCustomers] = await pool.execute(topCustomersQuery, params);

      return {
        totalCustomers: totalCustomers[0].count,
        activeCustomers: activeCustomers[0].count,
        totalLoyaltyPoints: parseInt(totalLoyaltyPoints[0].total) || 0,
        totalSpent: parseFloat(totalSpent[0].total) || 0,
        averageSpent: parseFloat(avgSpent[0].average) || 0,
        topCustomers: topCustomers
      };
    } catch (error) {
      throw new Error(`Error fetching customer statistics: ${error.message}`);
    }
  }

  // Redeem loyalty points
  static async redeemPoints(customerId, pointsToRedeem) {
    try {
      const customer = await this.getById(customerId);
      if (!customer) {
        throw new Error('Customer not found');
      }

      if (customer.loyalty_points < pointsToRedeem) {
        throw new Error('Insufficient loyalty points');
      }

      const [result] = await pool.execute(`
        UPDATE customers 
        SET loyalty_points = loyalty_points - ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [pointsToRedeem, customerId]);

      if (result.affectedRows === 0) {
        throw new Error('Failed to redeem points');
      }

      return await this.getById(customerId);
    } catch (error) {
      throw new Error(`Error redeeming loyalty points: ${error.message}`);
    }
  }
}

module.exports = Customer; 