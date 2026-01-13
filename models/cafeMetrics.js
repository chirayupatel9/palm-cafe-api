const { pool } = require('../config/database');

/**
 * Cafe Metrics Model
 * Provides aggregated metrics and statistics for cafes (Super Admin use)
 */
class CafeMetrics {
  /**
   * Get comprehensive metrics for a specific cafe
   */
  static async getCafeMetrics(cafeId) {
    try {
      // Check if cafe_id columns exist
      const [usersColumns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const [ordersColumns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'orders' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const [customersColumns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'customers' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = usersColumns.length > 0 && ordersColumns.length > 0;

      const metrics = {
        cafe_id: cafeId,
        users: {},
        orders: {},
        customers: {},
        activity: {}
      };

      if (hasCafeId) {
        // User metrics
        const [totalUsers] = await pool.execute(
          'SELECT COUNT(*) as count FROM users WHERE cafe_id = ?',
          [cafeId]
        );
        const [activeUsers] = await pool.execute(
          'SELECT COUNT(*) as count FROM users WHERE cafe_id = ? AND last_login >= DATE_SUB(NOW(), INTERVAL 30 DAY)',
          [cafeId]
        );
        const [usersByRole] = await pool.execute(
          `SELECT role, COUNT(*) as count 
           FROM users 
           WHERE cafe_id = ? 
           GROUP BY role`,
          [cafeId]
        );

        metrics.users = {
          total: totalUsers[0].count,
          active_last_30_days: activeUsers[0].count,
          by_role: usersByRole.reduce((acc, row) => {
            acc[row.role] = row.count;
            return acc;
          }, {})
        };

        // Order metrics
        const [totalOrders] = await pool.execute(
          'SELECT COUNT(*) as count FROM orders WHERE cafe_id = ?',
          [cafeId]
        );
        const [ordersToday] = await pool.execute(
          'SELECT COUNT(*) as count FROM orders WHERE cafe_id = ? AND DATE(created_at) = CURDATE()',
          [cafeId]
        );
        const [ordersThisMonth] = await pool.execute(
          'SELECT COUNT(*) as count FROM orders WHERE cafe_id = ? AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())',
          [cafeId]
        );
        const [totalRevenue] = await pool.execute(
          'SELECT COALESCE(SUM(final_amount), 0) as total FROM orders WHERE cafe_id = ? AND status = "completed"',
          [cafeId]
        );
        const [revenueThisMonth] = await pool.execute(
          `SELECT COALESCE(SUM(final_amount), 0) as total 
           FROM orders 
           WHERE cafe_id = ? 
           AND status = "completed" 
           AND MONTH(created_at) = MONTH(CURDATE()) 
           AND YEAR(created_at) = YEAR(CURDATE())`,
          [cafeId]
        );
        const [ordersByStatus] = await pool.execute(
          `SELECT status, COUNT(*) as count 
           FROM orders 
           WHERE cafe_id = ? 
           GROUP BY status`,
          [cafeId]
        );

        metrics.orders = {
          total: totalOrders[0].count,
          today: ordersToday[0].count,
          this_month: ordersThisMonth[0].count,
          total_revenue: parseFloat(totalRevenue[0].total || 0),
          revenue_this_month: parseFloat(revenueThisMonth[0].total || 0),
          by_status: ordersByStatus.reduce((acc, row) => {
            acc[row.status] = row.count;
            return acc;
          }, {})
        };

        // Customer metrics
        const [totalCustomers] = await pool.execute(
          'SELECT COUNT(*) as count FROM customers WHERE cafe_id = ?',
          [cafeId]
        );
        const [activeCustomers] = await pool.execute(
          'SELECT COUNT(*) as count FROM customers WHERE cafe_id = ? AND is_active = TRUE',
          [cafeId]
        );
        const [customersThisMonth] = await pool.execute(
          'SELECT COUNT(*) as count FROM customers WHERE cafe_id = ? AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())',
          [cafeId]
        );

        metrics.customers = {
          total: totalCustomers[0].count,
          active: activeCustomers[0].count,
          new_this_month: customersThisMonth[0].count
        };

        // Activity metrics (last activity timestamp)
        const [lastOrder] = await pool.execute(
          'SELECT MAX(created_at) as last_activity FROM orders WHERE cafe_id = ?',
          [cafeId]
        );
        const [lastUserLogin] = await pool.execute(
          'SELECT MAX(last_login) as last_activity FROM users WHERE cafe_id = ? AND last_login IS NOT NULL',
          [cafeId]
        );

        metrics.activity = {
          last_order: lastOrder[0].last_activity || null,
          last_user_login: lastUserLogin[0].last_activity || null,
          last_activity: lastOrder[0].last_activity || lastUserLogin[0].last_activity || null
        };
      } else {
        // Return empty metrics if cafe_id columns don't exist yet
        metrics.users = { total: 0, active_last_30_days: 0, by_role: {} };
        metrics.orders = { total: 0, today: 0, this_month: 0, total_revenue: 0, revenue_this_month: 0, by_status: {} };
        metrics.customers = { total: 0, active: 0, new_this_month: 0 };
        metrics.activity = { last_order: null, last_user_login: null, last_activity: null };
      }

      return metrics;
    } catch (error) {
      throw new Error(`Error fetching cafe metrics: ${error.message}`);
    }
  }

  /**
   * Get metrics for all cafes (Super Admin overview)
   */
  static async getAllCafesMetrics() {
    try {
      // Check if cafes table exists
      const [cafesTable] = await pool.execute(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'cafes'
      `);

      if (cafesTable.length === 0) {
        return [];
      }

      const [cafes] = await pool.execute('SELECT id, slug, name, is_active FROM cafes');
      
      const cafesWithMetrics = await Promise.all(
        cafes.map(async (cafe) => {
          const metrics = await this.getCafeMetrics(cafe.id);
          return {
            ...cafe,
            metrics
          };
        })
      );

      return cafesWithMetrics;
    } catch (error) {
      throw new Error(`Error fetching all cafes metrics: ${error.message}`);
    }
  }
}

module.exports = CafeMetrics;
