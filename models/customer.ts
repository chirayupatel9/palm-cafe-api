import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';

export interface CustomerRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address?: string | null;
  date_of_birth?: string | Date | null;
  loyalty_points: number;
  total_spent: number;
  visit_count: number;
  first_visit_date?: Date | null;
  last_visit_date?: Date | null;
  is_active?: boolean;
  notes?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface CustomerCreateData {
  name: string;
  email: string | null;
  phone: string | null;
  address?: string | null;
  date_of_birth?: string | Date | null;
  notes?: string | null;
  cafe_id?: number | null;
}

export interface CustomerUpdateData {
  name?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  date_of_birth?: string | Date | null;
  notes?: string | null;
  is_active?: boolean;
}

export interface CustomerOrderHistoryItem {
  id: number;
  order_number: string;
  total_amount: number;
  final_amount: number;
  status: string;
  payment_method: string | null;
  created_at: Date;
  items: { name: string; quantity: number; unit_price: number; total_price: number }[];
}

class Customer {
  static async getAll(
    cafeId: number | null = null,
    options: { limit?: number; offset?: number } = {}
  ): Promise<CustomerRow[]> {
    try {
      const limit =
        options.limit != null && options.limit > 0 ? Math.min(options.limit, 100) : null;
      const offset = options.offset != null && options.offset >= 0 ? options.offset : 0;

      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;

      let whereClause = '';
      const params: number[] = [];
      if (hasCafeId && cafeId) {
        whereClause = 'WHERE cafe_id = ?';
        params.push(cafeId);
      } else if (hasCafeId && !cafeId) {
        return [];
      }

      let limitClause = '';
      if (limit != null) {
        const lim = Math.max(0, parseInt(String(limit), 10) || 0);
        const off = Math.max(0, parseInt(String(offset), 10) || 0);
        limitClause = ` LIMIT ${lim} OFFSET ${off}`;
      }

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, name, email, phone, address, date_of_birth, loyalty_points, total_spent, visit_count,
          first_visit_date, last_visit_date, is_active, notes, created_at, updated_at
         FROM customers ${whereClause} ORDER BY name ASC${limitClause}`,
        params
      );
      return (rows as RowDataPacket[]).map((customer: RowDataPacket) => ({
        ...customer,
        loyalty_points: parseInt(String(customer.loyalty_points)) || 0,
        total_spent: parseFloat(String(customer.total_spent)) || 0,
        visit_count: parseInt(String(customer.visit_count)) || 0
      })) as CustomerRow[];
    } catch (error) {
      throw new Error(`Error fetching customers: ${(error as Error).message}`);
    }
  }

  static async getById(id: number, cafeId: number | null = null): Promise<CustomerRow | null> {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, name, email, phone, address, date_of_birth, loyalty_points, total_spent, visit_count,
          first_visit_date, last_visit_date, is_active, notes, created_at, updated_at
         FROM customers WHERE id = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
        hasCafeId ? [id, cafeId] : [id]
      );
      if (rows.length === 0) return null;
      const customer = rows[0] as RowDataPacket;
      return {
        ...customer,
        loyalty_points: parseInt(String(customer.loyalty_points), 10),
        total_spent: parseFloat(String(customer.total_spent)),
        visit_count: parseInt(String(customer.visit_count), 10)
      } as CustomerRow;
    } catch (error) {
      throw new Error(`Error fetching customer: ${(error as Error).message}`);
    }
  }

  static async findByEmail(email: string, cafeId: number | null = null): Promise<CustomerRow | null> {
    return this.findByEmailOrPhone(email, '__no_match__', cafeId);
  }

  static async findByEmailOrPhone(
    email: string,
    phone: string,
    cafeId: number | null = null
  ): Promise<CustomerRow | null> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;

      let whereClause = 'WHERE (email = ? OR phone = ?)';
      const params: (string | number)[] = [email, phone];
      if (hasCafeId && cafeId) {
        whereClause += ' AND cafe_id = ?';
        params.push(cafeId);
      } else if (hasCafeId && !cafeId) {
        return null;
      }

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, name, email, phone, address, date_of_birth, loyalty_points, total_spent, visit_count,
          first_visit_date, last_visit_date, is_active, notes, created_at, updated_at
         FROM customers ${whereClause} LIMIT 1`,
        params
      );
      if (rows.length === 0) return null;
      const customer = rows[0] as RowDataPacket;
      return {
        ...customer,
        loyalty_points: parseInt(String(customer.loyalty_points)) || 0,
        total_spent: parseFloat(String(customer.total_spent)) || 0,
        visit_count: parseInt(String(customer.visit_count)) || 0
      } as CustomerRow;
    } catch (error) {
      throw new Error(`Error finding customer: ${(error as Error).message}`);
    }
  }

  static async create(customerData: CustomerCreateData): Promise<CustomerRow> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;
      const { name, email, phone, address, date_of_birth, notes, cafe_id } = customerData;

      let query: string;
      let params: (string | number | Date | null)[];
      if (hasCafeId) {
        if (!cafe_id) throw new Error('cafe_id is required when creating a customer');
        query = `INSERT INTO customers (name, email, phone, address, date_of_birth, notes, cafe_id) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        params = [name ?? '', email ?? null, phone ?? null, address ?? null, date_of_birth ?? null, notes ?? null, cafe_id];
      } else {
        query = `INSERT INTO customers (name, email, phone, address, date_of_birth, notes) VALUES (?, ?, ?, ?, ?, ?)`;
        params = [name ?? '', email ?? null, phone ?? null, address ?? null, date_of_birth ?? null, notes ?? null];
      }

      const [result] = await pool.execute<RowDataPacket[] & { insertId: number }>(query, params);
      const created = await this.getById(result.insertId, cafe_id ?? null);
      if (!created) throw new Error('Failed to fetch created customer');
      return created;
    } catch (error) {
      throw new Error(`Error creating customer: ${(error as Error).message}`);
    }
  }

  static async update(
    id: number,
    customerData: CustomerUpdateData,
    cafeId: number | null = null
  ): Promise<CustomerRow> {
    try {
      const { name, email, phone, address, date_of_birth, notes, is_active } = customerData;
      const hasCafeId = cafeId != null;
      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(
        `UPDATE customers SET name = ?, email = ?, phone = ?, address = ?, date_of_birth = ?, notes = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
        hasCafeId
          ? [name ?? '', email ?? null, phone ?? null, address ?? null, date_of_birth ?? null, notes ?? null, is_active ?? true, id, cafeId]
          : [name ?? '', email ?? null, phone ?? null, address ?? null, date_of_birth ?? null, notes ?? null, is_active ?? true, id]
      );
      if (result.affectedRows === 0) throw new Error('Customer not found');
      const updated = await this.getById(id, cafeId);
      if (!updated) throw new Error('Customer not found');
      return updated;
    } catch (error) {
      throw new Error(`Error updating customer: ${(error as Error).message}`);
    }
  }

  static async updateLoyaltyData(
    id: number,
    orderAmount: number,
    pointsChange: number | null = null,
    cafeId: number | null = null
  ): Promise<CustomerRow> {
    try {
      const pointsToAdd = pointsChange !== null ? pointsChange : Math.floor(orderAmount / 10);
      const hasCafeId = cafeId != null;
      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(
        `UPDATE customers SET loyalty_points = loyalty_points + ?, total_spent = total_spent + ?, visit_count = visit_count + 1,
          last_visit_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
        hasCafeId ? [pointsToAdd, orderAmount, id, cafeId] : [pointsToAdd, orderAmount, id]
      );
      if (result.affectedRows === 0) throw new Error('Customer not found');
      const updated = await this.getById(id, cafeId);
      if (!updated) throw new Error('Customer not found');
      return updated;
    } catch (error) {
      throw new Error(`Error updating customer loyalty data: ${(error as Error).message}`);
    }
  }

  static async getOrderHistory(
    customerId: number,
    cafeId: number | null = null
  ): Promise<CustomerOrderHistoryItem[]> {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT o.id, o.order_number, o.total_amount, o.final_amount, o.status, o.payment_method, o.created_at,
          oi.quantity, oi.unit_price, oi.total_price, mi.name as item_name
         FROM orders o
         LEFT JOIN order_items oi ON o.id = oi.order_id
         LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
         WHERE o.customer_id = ? ${hasCafeId ? 'AND o.cafe_id = ?' : ''}
         ORDER BY o.created_at DESC`,
        hasCafeId ? [customerId, cafeId] : [customerId]
      );

      const orderMap = new Map<
        number,
        {
          id: number;
          order_number: string;
          total_amount: number;
          final_amount: number;
          status: string;
          payment_method: string | null;
          created_at: Date;
          items: { name: string; quantity: number; unit_price: number; total_price: number }[];
        }
      >();
      (rows as RowDataPacket[]).forEach((row: RowDataPacket) => {
        const oid = row.id as number;
        if (!orderMap.has(oid)) {
          orderMap.set(oid, {
            id: oid,
            order_number: row.order_number as string,
            total_amount: parseFloat(String(row.total_amount)),
            final_amount: parseFloat(String(row.final_amount)),
            status: row.status as string,
            payment_method: row.payment_method as string | null,
            created_at: row.created_at as Date,
            items: []
          });
        }
        if (row.item_name) {
          orderMap.get(oid)!.items.push({
            name: row.item_name as string,
            quantity: row.quantity as number,
            unit_price: parseFloat(String(row.unit_price)),
            total_price: parseFloat(String(row.total_price))
          });
        }
      });
      return Array.from(orderMap.values());
    } catch (error) {
      throw new Error(`Error fetching customer order history: ${(error as Error).message}`);
    }
  }

  static async search(query: string, cafeId: number | null = null): Promise<CustomerRow[]> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;
      const searchQuery = `%${query}%`;
      let whereClause = 'WHERE (name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      const params: (string | number)[] = [searchQuery, searchQuery, searchQuery];
      if (hasCafeId && cafeId) {
        whereClause += ' AND cafe_id = ?';
        params.push(cafeId);
      } else if (hasCafeId && !cafeId) {
        return [];
      }

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, name, email, phone, address, date_of_birth, loyalty_points, total_spent, visit_count,
          first_visit_date, last_visit_date, is_active, notes, created_at, updated_at
         FROM customers ${whereClause} ORDER BY name ASC`,
        params
      );
      return (rows as RowDataPacket[]).map((customer: RowDataPacket) => ({
        ...customer,
        loyalty_points: parseInt(String(customer.loyalty_points)) || 0,
        total_spent: parseFloat(String(customer.total_spent)) || 0,
        visit_count: parseInt(String(customer.visit_count)) || 0
      })) as CustomerRow[];
    } catch (error) {
      throw new Error(`Error searching customers: ${(error as Error).message}`);
    }
  }

  static async getStatistics(cafeId: number | null = null): Promise<{
    totalCustomers: number;
    activeCustomers: number;
    totalLoyaltyPoints: number;
    totalSpent: number;
    averageSpent: number;
    topCustomers: RowDataPacket[];
  }> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;

      let whereClause = '';
      const params: number[] = [];
      if (hasCafeId && cafeId) {
        whereClause = 'WHERE cafe_id = ?';
        params.push(cafeId);
      } else if (hasCafeId && !cafeId) {
        return {
          totalCustomers: 0,
          activeCustomers: 0,
          totalLoyaltyPoints: 0,
          totalSpent: 0,
          averageSpent: 0,
          topCustomers: []
        };
      }

      const [totalCustomers] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM customers ${whereClause}`,
        params
      );
      const activeWhereClause =
        hasCafeId && cafeId
          ? 'WHERE cafe_id = ? AND is_active = TRUE'
          : hasCafeId && !cafeId
            ? 'WHERE 1=0'
            : 'WHERE is_active = TRUE';
      const [activeCustomers] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM customers ${activeWhereClause}`,
        params
      );
      const [totalLoyaltyPoints] = await pool.execute<RowDataPacket[]>(
        `SELECT SUM(loyalty_points) as total FROM customers ${whereClause}`,
        params
      );
      const [totalSpent] = await pool.execute<RowDataPacket[]>(
        `SELECT SUM(total_spent) as total FROM customers ${whereClause}`,
        params
      );
      const [avgSpent] = await pool.execute<RowDataPacket[]>(
        `SELECT AVG(total_spent) as average FROM customers ${whereClause}`,
        params
      );
      const topCustomersQuery =
        hasCafeId && cafeId
          ? `SELECT name, total_spent, loyalty_points, visit_count FROM customers WHERE cafe_id = ? ORDER BY total_spent DESC LIMIT 5`
          : hasCafeId && !cafeId
            ? `SELECT name, total_spent, loyalty_points, visit_count FROM customers WHERE 1=0 LIMIT 5`
            : `SELECT name, total_spent, loyalty_points, visit_count FROM customers ORDER BY total_spent DESC LIMIT 5`;
      const [topCustomers] = await pool.execute<RowDataPacket[]>(topCustomersQuery, params);

      return {
        totalCustomers: (totalCustomers[0] as RowDataPacket).count as number,
        activeCustomers: (activeCustomers[0] as RowDataPacket).count as number,
        totalLoyaltyPoints: parseInt(String((totalLoyaltyPoints[0] as RowDataPacket).total), 10) || 0,
        totalSpent: parseFloat(String((totalSpent[0] as RowDataPacket).total)) || 0,
        averageSpent: parseFloat(String((avgSpent[0] as RowDataPacket).average)) || 0,
        topCustomers: topCustomers as RowDataPacket[]
      };
    } catch (error) {
      throw new Error(`Error fetching customer statistics: ${(error as Error).message}`);
    }
  }

  static async redeemPoints(
    customerId: number,
    pointsToRedeem: number,
    cafeId: number | null = null
  ): Promise<CustomerRow> {
    try {
      const customer = await this.getById(customerId, cafeId);
      if (!customer) throw new Error('Customer not found');
      if (customer.loyalty_points < pointsToRedeem) throw new Error('Insufficient loyalty points');

      const hasCafeId = cafeId != null;
      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(
        `UPDATE customers SET loyalty_points = loyalty_points - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
        hasCafeId ? [pointsToRedeem, customerId, cafeId] : [pointsToRedeem, customerId]
      );
      if (result.affectedRows === 0) throw new Error('Failed to redeem points');
      const updated = await this.getById(customerId, cafeId);
      if (!updated) throw new Error('Customer not found');
      return updated;
    } catch (error) {
      throw new Error(`Error redeeming loyalty points: ${(error as Error).message}`);
    }
  }
}

export default Customer;
