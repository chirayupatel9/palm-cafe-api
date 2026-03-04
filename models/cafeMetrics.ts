import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';

export interface CafeMetricsResult {
  cafe_id: number;
  users: {
    total: number;
    active_last_30_days: number;
    by_role: Record<string, number>;
  };
  orders: {
    total: number;
    today: number;
    this_month: number;
    total_revenue: number;
    revenue_this_month: number;
    by_status: Record<string, number>;
  };
  customers: {
    total: number;
    active: number;
    new_this_month: number;
  };
  activity: {
    last_order: Date | null;
    last_user_login: Date | null;
    last_activity: Date | null;
  };
}

class CafeMetrics {
  static async getCafeMetrics(cafeId: number): Promise<CafeMetricsResult> {
    try {
      const [usersColumns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'cafe_id'
      `);
      const [ordersColumns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'orders'
        AND COLUMN_NAME = 'cafe_id'
      `);
      const [customersColumns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'customers'
        AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = usersColumns.length > 0 && ordersColumns.length > 0;

      const metrics: CafeMetricsResult = {
        cafe_id: cafeId,
        users: {} as CafeMetricsResult['users'],
        orders: {} as CafeMetricsResult['orders'],
        customers: {} as CafeMetricsResult['customers'],
        activity: {} as CafeMetricsResult['activity']
      };

      if (hasCafeId) {
        const [totalUsers] = await pool.execute<RowDataPacket[]>(
          'SELECT COUNT(*) as count FROM users WHERE cafe_id = ?',
          [cafeId]
        );
        const [activeUsers] = await pool.execute<RowDataPacket[]>(
          'SELECT COUNT(*) as count FROM users WHERE cafe_id = ? AND last_login >= DATE_SUB(NOW(), INTERVAL 30 DAY)',
          [cafeId]
        );
        const [usersByRole] = await pool.execute<RowDataPacket[]>(
          `SELECT role, COUNT(*) as count FROM users WHERE cafe_id = ? GROUP BY role`,
          [cafeId]
        );
        metrics.users = {
          total: (totalUsers[0] as RowDataPacket).count as number,
          active_last_30_days: (activeUsers[0] as RowDataPacket).count as number,
          by_role: (usersByRole as RowDataPacket[]).reduce(
            (acc: Record<string, number>, row: RowDataPacket) => {
              acc[row.role as string] = row.count as number;
              return acc;
            },
            {}
          )
        };

        const [totalOrders] = await pool.execute<RowDataPacket[]>(
          'SELECT COUNT(*) as count FROM orders WHERE cafe_id = ?',
          [cafeId]
        );
        const [ordersToday] = await pool.execute<RowDataPacket[]>(
          'SELECT COUNT(*) as count FROM orders WHERE cafe_id = ? AND DATE(created_at) = CURDATE()',
          [cafeId]
        );
        const [ordersThisMonth] = await pool.execute<RowDataPacket[]>(
          'SELECT COUNT(*) as count FROM orders WHERE cafe_id = ? AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())',
          [cafeId]
        );
        const [totalRevenue] = await pool.execute<RowDataPacket[]>(
          'SELECT COALESCE(SUM(final_amount), 0) as total FROM orders WHERE cafe_id = ? AND status = "completed"',
          [cafeId]
        );
        const [revenueThisMonth] = await pool.execute<RowDataPacket[]>(
          `SELECT COALESCE(SUM(final_amount), 0) as total
           FROM orders
           WHERE cafe_id = ?
           AND status = "completed"
           AND MONTH(created_at) = MONTH(CURDATE())
           AND YEAR(created_at) = YEAR(CURDATE())`,
          [cafeId]
        );
        const [ordersByStatus] = await pool.execute<RowDataPacket[]>(
          `SELECT status, COUNT(*) as count FROM orders WHERE cafe_id = ? GROUP BY status`,
          [cafeId]
        );
        metrics.orders = {
          total: (totalOrders[0] as RowDataPacket).count as number,
          today: (ordersToday[0] as RowDataPacket).count as number,
          this_month: (ordersThisMonth[0] as RowDataPacket).count as number,
          total_revenue: parseFloat(String((totalRevenue[0] as RowDataPacket).total || 0)),
          revenue_this_month: parseFloat(String((revenueThisMonth[0] as RowDataPacket).total || 0)),
          by_status: (ordersByStatus as RowDataPacket[]).reduce(
            (acc: Record<string, number>, row: RowDataPacket) => {
              acc[row.status as string] = row.count as number;
              return acc;
            },
            {}
          )
        };

        const [totalCustomers] = await pool.execute<RowDataPacket[]>(
          'SELECT COUNT(*) as count FROM customers WHERE cafe_id = ?',
          [cafeId]
        );
        const [activeCustomers] = await pool.execute<RowDataPacket[]>(
          'SELECT COUNT(*) as count FROM customers WHERE cafe_id = ? AND is_active = TRUE',
          [cafeId]
        );
        const [customersThisMonth] = await pool.execute<RowDataPacket[]>(
          'SELECT COUNT(*) as count FROM customers WHERE cafe_id = ? AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())',
          [cafeId]
        );
        metrics.customers = {
          total: (totalCustomers[0] as RowDataPacket).count as number,
          active: (activeCustomers[0] as RowDataPacket).count as number,
          new_this_month: (customersThisMonth[0] as RowDataPacket).count as number
        };

        const [lastOrder] = await pool.execute<RowDataPacket[]>(
          'SELECT MAX(created_at) as last_activity FROM orders WHERE cafe_id = ?',
          [cafeId]
        );
        const [lastUserLogin] = await pool.execute<RowDataPacket[]>(
          'SELECT MAX(last_login) as last_activity FROM users WHERE cafe_id = ? AND last_login IS NOT NULL',
          [cafeId]
        );
        const lo = lastOrder[0] as RowDataPacket;
        const lu = lastUserLogin[0] as RowDataPacket;
        metrics.activity = {
          last_order: (lo.last_activity as Date) || null,
          last_user_login: (lu.last_activity as Date) || null,
          last_activity: (lo.last_activity as Date) || (lu.last_activity as Date) || null
        };
      } else {
        metrics.users = { total: 0, active_last_30_days: 0, by_role: {} };
        metrics.orders = {
          total: 0,
          today: 0,
          this_month: 0,
          total_revenue: 0,
          revenue_this_month: 0,
          by_status: {}
        };
        metrics.customers = { total: 0, active: 0, new_this_month: 0 };
        metrics.activity = { last_order: null, last_user_login: null, last_activity: null };
      }
      return metrics;
    } catch (error) {
      throw new Error(`Error fetching cafe metrics: ${(error as Error).message}`);
    }
  }

  static async getAllCafesMetrics(): Promise<
    (RowDataPacket & { id: number; slug: string; name: string; is_active: boolean; metrics: CafeMetricsResult })[]
  > {
    try {
      const [cafesTable] = await pool.execute<RowDataPacket[]>(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'cafes'
      `);
      if (cafesTable.length === 0) {
        return [];
      }
      const [cafes] = await pool.execute<RowDataPacket[]>(
        'SELECT id, slug, name, is_active FROM cafes'
      );
      const cafesWithMetrics = await Promise.all(
        (cafes as RowDataPacket[]).map(async (cafe: RowDataPacket) => {
          const metrics = await this.getCafeMetrics(cafe.id as number);
          return { ...cafe, metrics };
        })
      );
      return cafesWithMetrics as (RowDataPacket & {
        id: number;
        slug: string;
        name: string;
        is_active: boolean;
        metrics: CafeMetricsResult;
      })[];
    } catch (error) {
      throw new Error(`Error fetching all cafes metrics: ${(error as Error).message}`);
    }
  }
}

export default CafeMetrics;
