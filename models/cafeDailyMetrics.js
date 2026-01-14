const { pool } = require('../config/database');
const logger = require('../config/logger');

/**
 * Cafe Daily Metrics Model
 * Handles aggregated daily metrics for analytics
 */
class CafeDailyMetrics {
  /**
   * Get or create daily metrics for a cafe and date
   * @param {number} cafeId - Cafe ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} Daily metrics object
   */
  static async getOrCreate(cafeId, date) {
    try {
      // Try to get existing metrics
      const [existing] = await pool.execute(
        'SELECT * FROM cafe_daily_metrics WHERE cafe_id = ? AND date = ?',
        [cafeId, date]
      );

      if (existing.length > 0) {
        return existing[0];
      }

      // Create new metrics record
      const [result] = await pool.execute(
        `INSERT INTO cafe_daily_metrics 
         (cafe_id, date, total_orders, total_revenue, completed_orders, completed_revenue, total_customers, new_customers)
         VALUES (?, ?, 0, 0.00, 0, 0.00, 0, 0)`,
        [cafeId, date]
      );

      return {
        id: result.insertId,
        cafe_id: cafeId,
        date: date,
        total_orders: 0,
        total_revenue: 0.00,
        completed_orders: 0,
        completed_revenue: 0.00,
        total_customers: 0,
        new_customers: 0
      };
    } catch (error) {
      logger.error('Error getting or creating daily metrics:', error);
      throw new Error(`Error getting or creating daily metrics: ${error.message}`);
    }
  }

  /**
   * Increment order metrics for a cafe and date
   * @param {number} cafeId - Cafe ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {number} revenue - Order revenue (0 if not completed)
   * @param {boolean} isCompleted - Whether order is completed
   */
  static async incrementOrder(cafeId, date, revenue = 0, isCompleted = false) {
    try {
      const metrics = await this.getOrCreate(cafeId, date);

      await pool.execute(
        `UPDATE cafe_daily_metrics 
         SET total_orders = total_orders + 1,
             total_revenue = total_revenue + ?,
             ${isCompleted ? 'completed_orders = completed_orders + 1,' : ''}
             ${isCompleted ? 'completed_revenue = completed_revenue + ?' : 'completed_revenue = completed_revenue'}
         WHERE id = ?`,
        isCompleted ? [revenue, revenue, metrics.id] : [revenue, metrics.id]
      );
    } catch (error) {
      logger.error('Error incrementing order metrics:', error);
      // Don't throw - aggregation failures shouldn't break order creation
    }
  }

  /**
   * Decrement order metrics (when order is deleted or status changes)
   * @param {number} cafeId - Cafe ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {number} revenue - Order revenue
   * @param {boolean} wasCompleted - Whether order was completed
   */
  static async decrementOrder(cafeId, date, revenue = 0, wasCompleted = false) {
    try {
      const [existing] = await pool.execute(
        'SELECT * FROM cafe_daily_metrics WHERE cafe_id = ? AND date = ?',
        [cafeId, date]
      );

      if (existing.length === 0) {
        return; // No metrics to update
      }

      const metrics = existing[0];

      await pool.execute(
        `UPDATE cafe_daily_metrics 
         SET total_orders = GREATEST(0, total_orders - 1),
             total_revenue = GREATEST(0, total_revenue - ?),
             ${wasCompleted ? 'completed_orders = GREATEST(0, completed_orders - 1),' : ''}
             ${wasCompleted ? 'completed_revenue = GREATEST(0, completed_revenue - ?)' : 'completed_revenue = GREATEST(0, completed_revenue)'}
         WHERE id = ?`,
        wasCompleted ? [revenue, revenue, metrics.id] : [revenue, metrics.id]
      );
    } catch (error) {
      logger.error('Error decrementing order metrics:', error);
      // Don't throw - aggregation failures shouldn't break order updates
    }
  }

  /**
   * Update order completion status
   * @param {number} cafeId - Cafe ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {number} revenue - Order revenue
   * @param {boolean} isNowCompleted - Whether order is now completed
   */
  static async updateOrderCompletion(cafeId, date, revenue, isNowCompleted) {
    try {
      const metrics = await this.getOrCreate(cafeId, date);

      if (isNowCompleted) {
        // Order just completed - add to completed metrics
        await pool.execute(
          `UPDATE cafe_daily_metrics 
           SET completed_orders = completed_orders + 1,
               completed_revenue = completed_revenue + ?
           WHERE id = ?`,
          [revenue, metrics.id]
        );
      } else {
        // Order no longer completed - remove from completed metrics
        await pool.execute(
          `UPDATE cafe_daily_metrics 
           SET completed_orders = GREATEST(0, completed_orders - 1),
               completed_revenue = GREATEST(0, completed_revenue - ?)
           WHERE id = ?`,
          [revenue, metrics.id]
        );
      }
    } catch (error) {
      logger.error('Error updating order completion metrics:', error);
      // Don't throw - aggregation failures shouldn't break order updates
    }
  }

  /**
   * Increment customer metrics
   * @param {number} cafeId - Cafe ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {boolean} isNew - Whether this is a new customer
   */
  static async incrementCustomer(cafeId, date, isNew = false) {
    try {
      const metrics = await this.getOrCreate(cafeId, date);

      await pool.execute(
        `UPDATE cafe_daily_metrics 
         SET total_customers = total_customers + 1,
             ${isNew ? 'new_customers = new_customers + 1' : 'new_customers = new_customers'}
         WHERE id = ?`,
        [metrics.id]
      );
    } catch (error) {
      logger.error('Error incrementing customer metrics:', error);
      // Don't throw - aggregation failures shouldn't break customer creation
    }
  }

  /**
   * Get daily metrics for a date range
   * @param {number} cafeId - Cafe ID
   * @param {string} startDate - Start date in YYYY-MM-DD format
   * @param {string} endDate - End date in YYYY-MM-DD format
   * @returns {Promise<Array>} Array of daily metrics
   */
  static async getDateRange(cafeId, startDate, endDate) {
    try {
      const [rows] = await pool.execute(
        `SELECT * FROM cafe_daily_metrics 
         WHERE cafe_id = ? AND date >= ? AND date <= ?
         ORDER BY date ASC`,
        [cafeId, startDate, endDate]
      );

      return rows.map(row => ({
        date: row.date.toISOString().split('T')[0],
        total_orders: row.total_orders,
        total_revenue: parseFloat(row.total_revenue || 0),
        completed_orders: row.completed_orders,
        completed_revenue: parseFloat(row.completed_revenue || 0),
        total_customers: row.total_customers,
        new_customers: row.new_customers
      }));
    } catch (error) {
      logger.error('Error fetching date range metrics:', error);
      throw new Error(`Error fetching date range metrics: ${error.message}`);
    }
  }

  /**
   * Get aggregated totals for a cafe
   * @param {number} cafeId - Cafe ID
   * @returns {Promise<Object>} Aggregated totals
   */
  static async getTotals(cafeId) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
           SUM(total_orders) as total_orders,
           SUM(completed_revenue) as total_revenue,
           SUM(completed_orders) as completed_orders,
           SUM(total_customers) as total_customers
         FROM cafe_daily_metrics 
         WHERE cafe_id = ?`,
        [cafeId]
      );

      return {
        total_orders: parseInt(rows[0].total_orders || 0),
        total_revenue: parseFloat(rows[0].total_revenue || 0),
        completed_orders: parseInt(rows[0].completed_orders || 0),
        total_customers: parseInt(rows[0].total_customers || 0)
      };
    } catch (error) {
      logger.error('Error fetching totals:', error);
      throw new Error(`Error fetching totals: ${error.message}`);
    }
  }

  /**
   * Get today's metrics
   * @param {number} cafeId - Cafe ID
   * @returns {Promise<Object>} Today's metrics
   */
  static async getToday(cafeId) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const metrics = await this.getOrCreate(cafeId, today);

      return {
        total_orders: metrics.total_orders,
        total_revenue: parseFloat(metrics.total_revenue || 0),
        completed_orders: metrics.completed_orders,
        completed_revenue: parseFloat(metrics.completed_revenue || 0)
      };
    } catch (error) {
      logger.error('Error fetching today metrics:', error);
      throw new Error(`Error fetching today metrics: ${error.message}`);
    }
  }

  /**
   * Get this month's metrics
   * @param {number} cafeId - Cafe ID
   * @returns {Promise<Object>} This month's metrics
   */
  static async getThisMonth(cafeId) {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

      const [rows] = await pool.execute(
        `SELECT 
           SUM(total_orders) as total_orders,
           SUM(completed_revenue) as total_revenue
         FROM cafe_daily_metrics 
         WHERE cafe_id = ? AND date >= ? AND date <= ?`,
        [cafeId, startDate, endDate]
      );

      return {
        total_orders: parseInt(rows[0].total_orders || 0),
        total_revenue: parseFloat(rows[0].total_revenue || 0)
      };
    } catch (error) {
      logger.error('Error fetching this month metrics:', error);
      throw new Error(`Error fetching this month metrics: ${error.message}`);
    }
  }

  /**
   * Recompute metrics for a specific date (for backfill or correction)
   * @param {number} cafeId - Cafe ID
   * @param {string} date - Date in YYYY-MM-DD format
   */
  static async recompute(cafeId, date) {
    try {
      // Check if cafe_id column exists in orders
      const [ordersColumns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'orders' 
        AND COLUMN_NAME = 'cafe_id'
      `);

      if (ordersColumns.length === 0) {
        logger.warn('cafe_id column does not exist in orders table');
        return;
      }

      // Get all orders for this cafe and date
      const [orders] = await pool.execute(
        `SELECT 
           COUNT(*) as total_orders,
           COALESCE(SUM(final_amount), 0) as total_revenue,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
           COALESCE(SUM(CASE WHEN status = 'completed' THEN final_amount ELSE 0 END), 0) as completed_revenue
         FROM orders
         WHERE cafe_id = ? AND DATE(created_at) = ?`,
        [cafeId, date]
      );

      const orderData = orders[0];

      // Get customer metrics
      const [customersColumns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'customers' 
        AND COLUMN_NAME = 'cafe_id'
      `);

      let totalCustomers = 0;
      let newCustomers = 0;

      if (customersColumns.length > 0) {
        const [customerData] = await pool.execute(
          `SELECT 
             COUNT(*) as total_customers,
             SUM(CASE WHEN DATE(created_at) = ? THEN 1 ELSE 0 END) as new_customers
           FROM customers
           WHERE cafe_id = ? AND DATE(created_at) <= ?`,
          [date, cafeId, date]
        );

        totalCustomers = parseInt(customerData[0].total_customers || 0);
        newCustomers = parseInt(customerData[0].new_customers || 0);
      }

      // Update or insert metrics
      await pool.execute(
        `INSERT INTO cafe_daily_metrics 
         (cafe_id, date, total_orders, total_revenue, completed_orders, completed_revenue, total_customers, new_customers)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           total_orders = VALUES(total_orders),
           total_revenue = VALUES(total_revenue),
           completed_orders = VALUES(completed_orders),
           completed_revenue = VALUES(completed_revenue),
           total_customers = VALUES(total_customers),
           new_customers = VALUES(new_customers)`,
        [
          cafeId,
          date,
          parseInt(orderData.total_orders || 0),
          parseFloat(orderData.total_revenue || 0),
          parseInt(orderData.completed_orders || 0),
          parseFloat(orderData.completed_revenue || 0),
          totalCustomers,
          newCustomers
        ]
      );

      logger.info(`Recomputed metrics for cafe ${cafeId} on ${date}`);
    } catch (error) {
      logger.error(`Error recomputing metrics for cafe ${cafeId} on ${date}:`, error);
      throw error;
    }
  }
}

module.exports = CafeDailyMetrics;
