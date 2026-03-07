import { pool } from '../config/database';
import logger from '../config/logger';
import { RowDataPacket } from 'mysql2';

export interface PaymentMethodRow {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
  display_order: number;
  description?: string | null;
  icon?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface PaymentMethodCreateData {
  name: string;
  code: string;
  description?: string | null;
  icon?: string | null;
  display_order?: number;
  is_active?: boolean;
  cafe_id?: number | null;
}

export interface PaymentMethodUpdateData {
  name?: string;
  code?: string;
  description?: string | null;
  icon?: string | null;
  display_order?: number;
  is_active?: boolean;
}

class PaymentMethod {
  static async getAll(cafeId: number | null = null): Promise<PaymentMethodRow[]> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_methods' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;

      let query = `SELECT id, name, code, is_active, display_order, description, icon, created_at, updated_at FROM payment_methods WHERE is_active = TRUE`;
      const params: number[] = [];
      if (hasCafeId && cafeId) {
        query += ' AND cafe_id = ?';
        params.push(cafeId);
      } else if (hasCafeId && !cafeId) {
        return [];
      }
      query += ' ORDER BY display_order ASC, name ASC';

      const [rows] = await pool.execute<RowDataPacket[]>(query, params);
      return rows as PaymentMethodRow[];
    } catch (error) {
      throw new Error(`Error fetching payment methods: ${(error as Error).message}`);
    }
  }

  static async getAllForAdmin(cafeId: number | null = null): Promise<PaymentMethodRow[]> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_methods' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;

      let query = `SELECT id, name, code, is_active, display_order, description, icon, created_at, updated_at FROM payment_methods WHERE 1=1`;
      const params: number[] = [];
      if (hasCafeId && cafeId) {
        query += ' AND cafe_id = ?';
        params.push(cafeId);
      } else if (hasCafeId && !cafeId) {
        return [];
      }
      query += ' ORDER BY display_order ASC, name ASC';

      const [rows] = await pool.execute<RowDataPacket[]>(query, params);
      return rows as PaymentMethodRow[];
    } catch (error) {
      throw new Error(`Error fetching payment methods: ${(error as Error).message}`);
    }
  }

  static async getById(id: number, cafeId: number | null = null): Promise<PaymentMethodRow | null> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_methods' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;

      let query = `SELECT id, name, code, is_active, display_order, description, icon, created_at, updated_at FROM payment_methods WHERE id = ?`;
      const params: (number | null)[] = [id];
      if (hasCafeId && cafeId) {
        query += ' AND cafe_id = ?';
        params.push(cafeId);
      }

      const [rows] = await pool.execute<RowDataPacket[]>(query, params);
      if (rows.length === 0) return null;
      return rows[0] as PaymentMethodRow;
    } catch (error) {
      throw new Error(`Error fetching payment method: ${(error as Error).message}`);
    }
  }

  static async getByCode(code: string, cafeId: number | null = null): Promise<PaymentMethodRow | null> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_methods' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;

      let query = `SELECT id, name, code, is_active, display_order, description, icon, created_at, updated_at FROM payment_methods WHERE code = ? AND is_active = TRUE`;
      const params: (string | number)[] = [code];
      if (hasCafeId && cafeId) {
        query += ' AND cafe_id = ?';
        params.push(cafeId);
      }

      const [rows] = await pool.execute<RowDataPacket[]>(query, params);
      if (rows.length === 0) return null;
      return rows[0] as PaymentMethodRow;
    } catch (error) {
      throw new Error(`Error fetching payment method: ${(error as Error).message}`);
    }
  }

  static async create(paymentMethodData: PaymentMethodCreateData): Promise<PaymentMethodRow> {
    try {
      const {
        name,
        code,
        description,
        icon,
        display_order,
        is_active = true,
        cafe_id
      } = paymentMethodData;

      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_methods' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;

      if (hasCafeId && cafe_id) {
        const existing = await this.getByCode(code, cafe_id);
        if (existing) throw new Error('Payment method code already exists for this cafe');
      } else {
        const existing = await this.getByCode(code);
        if (existing) throw new Error('Payment method code already exists');
      }

      let query: string;
      let params: (string | number | boolean | null)[];
      if (hasCafeId && cafe_id) {
        query = `INSERT INTO payment_methods (name, code, description, icon, display_order, is_active, cafe_id) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        params = [name, code, description ?? null, icon ?? null, display_order || 0, is_active, cafe_id];
      } else {
        query = `INSERT INTO payment_methods (name, code, description, icon, display_order, is_active) VALUES (?, ?, ?, ?, ?, ?)`;
        params = [name, code, description ?? null, icon ?? null, display_order || 0, is_active];
      }

      const [result] = await pool.execute<RowDataPacket[] & { insertId: number }>(query, params);
      const created = await this.getById(result.insertId, cafe_id ?? null);
      if (!created) throw new Error('Failed to fetch created payment method');
      return created;
    } catch (error) {
      throw new Error(`Error creating payment method: ${(error as Error).message}`);
    }
  }

  static async update(
    id: number,
    cafeId: number | null,
    paymentMethodData: PaymentMethodUpdateData
  ): Promise<PaymentMethodRow> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_methods' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;
      const { name, code, description, icon, display_order, is_active } = paymentMethodData;

      if (code && hasCafeId && cafeId != null) {
        const existingByCode = await this.getByCode(code, cafeId);
        if (existingByCode && existingByCode.id !== parseInt(String(id), 10)) {
          throw new Error('Payment method code already exists for this cafe');
        }
      } else if (code && (!hasCafeId || cafeId == null)) {
        const existingByCode = await this.getByCode(code);
        if (existingByCode && existingByCode.id !== parseInt(String(id), 10)) {
          throw new Error('Payment method code already exists');
        }
      }

      let query = `UPDATE payment_methods SET name = ?, code = ?, description = ?, icon = ?, display_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      const params: (string | number | boolean | null)[] = [
        name ?? '',
        code ?? '',
        description ?? null,
        icon ?? null,
        display_order ?? 0,
        is_active ?? true,
        id
      ];
      if (hasCafeId && cafeId != null) {
        query += ' AND cafe_id = ?';
        params.push(cafeId);
      }

      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(query, params);
      if (result.affectedRows === 0) throw new Error('Payment method not found');
      const updated = await this.getById(id, cafeId);
      if (!updated) throw new Error('Payment method not found');
      return updated;
    } catch (error) {
      throw new Error(`Error updating payment method: ${(error as Error).message}`);
    }
  }

  static async delete(id: number, cafeId: number | null): Promise<{ success: boolean; message: string }> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_methods' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;

      let query = 'DELETE FROM payment_methods WHERE id = ?';
      const params: (number | null)[] = [id];
      if (hasCafeId && cafeId != null) {
        query += ' AND cafe_id = ?';
        params.push(cafeId);
      }

      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(query, params);
      if (result.affectedRows === 0) throw new Error('Payment method not found');
      return { success: true, message: 'Payment method deleted successfully' };
    } catch (error) {
      throw new Error(`Error deleting payment method: ${(error as Error).message}`);
    }
  }

  static async toggleStatus(id: number, cafeId: number | null): Promise<PaymentMethodRow> {
    try {
      const paymentMethod = await this.getById(id, cafeId);
      if (!paymentMethod) throw new Error('Payment method not found');

      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_methods' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;

      const newStatus = !paymentMethod.is_active;
      let query = `UPDATE payment_methods SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      const params: (boolean | number | null)[] = [newStatus, id];
      if (hasCafeId && cafeId != null) {
        query += ' AND cafe_id = ?';
        params.push(cafeId);
      }

      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(query, params);
      if (result.affectedRows === 0) throw new Error('Payment method not found');
      const updated = await this.getById(id, cafeId);
      if (!updated) throw new Error('Payment method not found');
      return updated;
    } catch (error) {
      throw new Error(`Error toggling payment method status: ${(error as Error).message}`);
    }
  }

  static async reorder(
    cafeId: number | null,
    orderedIds: number[]
  ): Promise<{ success: boolean; message: string }> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_methods' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;

      const connection = await pool.getConnection();
      await connection.beginTransaction();
      try {
        for (let i = 0; i < orderedIds.length; i++) {
          let query = `UPDATE payment_methods SET display_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
          const params: (number | null)[] = [i + 1, orderedIds[i]];
          if (hasCafeId && cafeId != null) {
            query += ' AND cafe_id = ?';
            params.push(cafeId);
          }
          await connection.execute(query, params);
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
      throw new Error(`Error reordering payment methods: ${(error as Error).message}`);
    }
  }

  static async getDefaults(): Promise<PaymentMethodRow[]> {
    return [
      {
        name: 'Cash',
        code: 'cash',
        description: 'Pay with cash',
        icon: '💵',
        display_order: 1,
        is_active: true
      } as PaymentMethodRow,
      {
        name: 'UPI',
        code: 'upi',
        description: 'Pay using UPI',
        icon: '📱',
        display_order: 2,
        is_active: true
      } as PaymentMethodRow
    ];
  }

  static async initializeDefaults(): Promise<void> {
    try {
      const defaults = await this.getDefaults();
      const existing = await this.getAll();
      if (existing.length === 0) {
        for (const defaultMethod of defaults) {
          await this.create(defaultMethod);
        }
      }
    } catch (error) {
      logger.error('Error initializing default payment methods', {
        message: (error as Error).message
      });
    }
  }
}

export default PaymentMethod;
