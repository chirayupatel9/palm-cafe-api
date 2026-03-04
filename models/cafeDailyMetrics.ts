import { pool } from '../config/database';
import logger from '../config/logger';
import { RowDataPacket } from 'mysql2';

export interface CafeDailyMetricsRow {
  id: number;
  cafe_id: number;
  date: string;
  total_orders: number;
  total_revenue: number;
  completed_orders: number;
  completed_revenue: number;
  total_customers: number;
  new_customers: number;
}

export interface DailyMetricsDateRangeItem {
  date: string;
  total_orders: number;
  total_revenue: number;
  completed_orders: number;
  completed_revenue: number;
  total_customers: number;
  new_customers: number;
}

class CafeDailyMetrics {
  static async getOrCreate(cafeId: number, date: string): Promise<CafeDailyMetricsRow> {
    try {
      const [existing] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM cafe_daily_metrics WHERE cafe_id = ? AND date = ?',
        [cafeId, date]
      );
      if (existing.length > 0) {
        return existing[0] as CafeDailyMetricsRow;
      }
      const [result] = await pool.execute<RowDataPacket[] & { insertId: number }>(
        `INSERT INTO cafe_daily_metrics
         (cafe_id, date, total_orders, total_revenue, completed_orders, completed_revenue, total_customers, new_customers)
         VALUES (?, ?, 0, 0.00, 0, 0.00, 0, 0)`,
        [cafeId, date]
      );
      return {
        id: result.insertId,
        cafe_id: cafeId,
        date,
        total_orders: 0,
        total_revenue: 0,
        completed_orders: 0,
        completed_revenue: 0,
        total_customers: 0,
        new_customers: 0
      };
    } catch (error) {
      logger.error('Error getting or creating daily metrics:', error);
      throw new Error(`Error getting or creating daily metrics: ${(error as Error).message}`);
    }
  }

  static async incrementOrder(
    cafeId: number,
    date: string,
    revenue = 0,
    isCompleted = false
  ): Promise<void> {
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
    }
  }

  static async decrementOrder(
    cafeId: number,
    date: string,
    revenue = 0,
    wasCompleted = false
  ): Promise<void> {
    try {
      const [existing] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM cafe_daily_metrics WHERE cafe_id = ? AND date = ?',
        [cafeId, date]
      );
      if (existing.length === 0) return;
      const metrics = existing[0] as CafeDailyMetricsRow;
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
    }
  }

  static async updateOrderCompletion(
    cafeId: number,
    date: string,
    revenue: number,
    isNowCompleted: boolean
  ): Promise<void> {
    try {
      const metrics = await this.getOrCreate(cafeId, date);
      if (isNowCompleted) {
        await pool.execute(
          `UPDATE cafe_daily_metrics
           SET completed_orders = completed_orders + 1,
               completed_revenue = completed_revenue + ?
           WHERE id = ?`,
          [revenue, metrics.id]
        );
      } else {
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
    }
  }

  static async incrementCustomer(cafeId: number, date: string, isNew = false): Promise<void> {
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
    }
  }

  static async getDateRange(
    cafeId: number,
    startDate: string,
    endDate: string
  ): Promise<DailyMetricsDateRangeItem[]> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT * FROM cafe_daily_metrics
         WHERE cafe_id = ? AND date >= ? AND date <= ?
         ORDER BY date ASC`,
        [cafeId, startDate, endDate]
      );
      return (rows as RowDataPacket[]).map((row: RowDataPacket) => ({
        date: (row.date as Date).toISOString().split('T')[0],
        total_orders: row.total_orders as number,
        total_revenue: parseFloat(String(row.total_revenue || 0)),
        completed_orders: row.completed_orders as number,
        completed_revenue: parseFloat(String(row.completed_revenue || 0)),
        total_customers: row.total_customers as number,
        new_customers: row.new_customers as number
      }));
    } catch (error) {
      logger.error('Error fetching date range metrics:', error);
      throw new Error(`Error fetching date range metrics: ${(error as Error).message}`);
    }
  }

  static async getTotals(cafeId: number): Promise<{
    total_orders: number;
    total_revenue: number;
    completed_orders: number;
    total_customers: number;
  }> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT
           SUM(total_orders) as total_orders,
           SUM(completed_revenue) as total_revenue,
           SUM(completed_orders) as completed_orders,
           SUM(total_customers) as total_customers
         FROM cafe_daily_metrics
         WHERE cafe_id = ?`,
        [cafeId]
      );
      const r = rows[0] as RowDataPacket;
      return {
        total_orders: parseInt(String(r.total_orders || 0), 10),
        total_revenue: parseFloat(String(r.total_revenue || 0)),
        completed_orders: parseInt(String(r.completed_orders || 0), 10),
        total_customers: parseInt(String(r.total_customers || 0), 10)
      };
    } catch (error) {
      logger.error('Error fetching totals:', error);
      throw new Error(`Error fetching totals: ${(error as Error).message}`);
    }
  }

  static async getToday(cafeId: number): Promise<{
    total_orders: number;
    total_revenue: number;
    completed_orders: number;
    completed_revenue: number;
  }> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const metrics = await this.getOrCreate(cafeId, today);
      return {
        total_orders: metrics.total_orders,
        total_revenue: parseFloat(String(metrics.total_revenue || 0)),
        completed_orders: metrics.completed_orders,
        completed_revenue: parseFloat(String(metrics.completed_revenue || 0))
      };
    } catch (error) {
      logger.error('Error fetching today metrics:', error);
      throw new Error(`Error fetching today metrics: ${(error as Error).message}`);
    }
  }

  static async getThisMonth(cafeId: number): Promise<{ total_orders: number; total_revenue: number }> {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT
           SUM(total_orders) as total_orders,
           SUM(completed_revenue) as total_revenue
         FROM cafe_daily_metrics
         WHERE cafe_id = ? AND date >= ? AND date <= ?`,
        [cafeId, startDate, endDate]
      );
      const r = rows[0] as RowDataPacket;
      return {
        total_orders: parseInt(String(r.total_orders || 0), 10),
        total_revenue: parseFloat(String(r.total_revenue || 0))
      };
    } catch (error) {
      logger.error('Error fetching this month metrics:', error);
      throw new Error(`Error fetching this month metrics: ${(error as Error).message}`);
    }
  }

  static async recompute(cafeId: number, date: string): Promise<void> {
    try {
      const [ordersColumns] = await pool.execute<RowDataPacket[]>(`
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

      const [orders] = await pool.execute<RowDataPacket[]>(
        `SELECT
           COUNT(*) as total_orders,
           COALESCE(SUM(final_amount), 0) as total_revenue,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
           COALESCE(SUM(CASE WHEN status = 'completed' THEN final_amount ELSE 0 END), 0) as completed_revenue
         FROM orders
         WHERE cafe_id = ? AND DATE(created_at) = ?`,
        [cafeId, date]
      );
      const orderData = orders[0] as RowDataPacket;

      const [customersColumns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'customers'
        AND COLUMN_NAME = 'cafe_id'
      `);
      let totalCustomers = 0;
      let newCustomers = 0;
      if (customersColumns.length > 0) {
        const [customerData] = await pool.execute<RowDataPacket[]>(
          `SELECT
             COUNT(*) as total_customers,
             SUM(CASE WHEN DATE(created_at) = ? THEN 1 ELSE 0 END) as new_customers
           FROM customers
           WHERE cafe_id = ? AND DATE(created_at) <= ?`,
          [date, cafeId, date]
        );
        const c = customerData[0] as RowDataPacket;
        totalCustomers = parseInt(String(c.total_customers || 0), 10);
        newCustomers = parseInt(String(c.new_customers || 0), 10);
      }

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
          parseInt(String(orderData.total_orders || 0), 10),
          parseFloat(String(orderData.total_revenue || 0)),
          parseInt(String(orderData.completed_orders || 0), 10),
          parseFloat(String(orderData.completed_revenue || 0)),
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

export default CafeDailyMetrics;
