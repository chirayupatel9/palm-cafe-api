const { pool } = require('../config/database');

class Customer {
  // Get all customers
  static async getAll() {
    try {
      const [rows] = await pool.execute(`
        SELECT 
          id, name, email, phone, address, date_of_birth,
          loyalty_points, total_spent, visit_count,
          first_visit_date, last_visit_date, is_active, notes,
          created_at, updated_at
        FROM customers
        ORDER BY name ASC
      `);

      return rows.map(customer => ({
        ...customer,
        loyalty_points: parseInt(customer.loyalty_points),
        total_spent: parseFloat(customer.total_spent),
        visit_count: parseInt(customer.visit_count)
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

  // Get customer by email or phone
  static async findByEmailOrPhone(email, phone) {
    try {
      const [rows] = await pool.execute(`
        SELECT 
          id, name, email, phone, address, date_of_birth,
          loyalty_points, total_spent, visit_count,
          first_visit_date, last_visit_date, is_active, notes,
          created_at, updated_at
        FROM customers
        WHERE email = ? OR phone = ?
      `, [email, phone]);

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
      throw new Error(`Error finding customer: ${error.message}`);
    }
  }

  // Create new customer
  static async create(customerData) {
    try {
      const {
        name, email, phone, address, date_of_birth, notes
      } = customerData;

      const [result] = await pool.execute(`
        INSERT INTO customers (name, email, phone, address, date_of_birth, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [name, email, phone, address, date_of_birth, notes]);

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

  // Search customers
  static async search(query) {
    try {
      const searchQuery = `%${query}%`;
      const [rows] = await pool.execute(`
        SELECT 
          id, name, email, phone, address, date_of_birth,
          loyalty_points, total_spent, visit_count,
          first_visit_date, last_visit_date, is_active, notes,
          created_at, updated_at
        FROM customers
        WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?
        ORDER BY name ASC
      `, [searchQuery, searchQuery, searchQuery]);

      return rows.map(customer => ({
        ...customer,
        loyalty_points: parseInt(customer.loyalty_points),
        total_spent: parseFloat(customer.total_spent),
        visit_count: parseInt(customer.visit_count)
      }));
    } catch (error) {
      throw new Error(`Error searching customers: ${error.message}`);
    }
  }

  // Get customer statistics
  static async getStatistics() {
    try {
      const [totalCustomers] = await pool.execute('SELECT COUNT(*) as count FROM customers');
      const [activeCustomers] = await pool.execute("SELECT COUNT(*) as count FROM customers WHERE is_active = TRUE");
      const [totalLoyaltyPoints] = await pool.execute('SELECT SUM(loyalty_points) as total FROM customers');
      const [totalSpent] = await pool.execute('SELECT SUM(total_spent) as total FROM customers');
      const [avgSpent] = await pool.execute('SELECT AVG(total_spent) as average FROM customers');
      const [topCustomers] = await pool.execute(`
        SELECT name, total_spent, loyalty_points, visit_count
        FROM customers
        ORDER BY total_spent DESC
        LIMIT 5
      `);

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