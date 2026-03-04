import { pool } from '../config/database';
import CafeDailyMetrics from './cafeDailyMetrics';
import logger from '../config/logger';
import { RowDataPacket } from 'mysql2';

export interface OrderItemRow {
  id: number | null;
  menu_item_id: number | null;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface OrderRow {
  id: number;
  order_number: string;
  customer_id?: number | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  table_number?: number | null;
  total_amount: number;
  tax_amount: number;
  tip_amount: number;
  points_redeemed: number;
  points_awarded: boolean;
  final_amount: number;
  status: string;
  payment_method: string | null;
  split_payment: boolean;
  split_payment_method?: string | null;
  split_amount: number;
  extra_charge: number;
  extra_charge_note: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  cafe_id?: number | null;
  items: OrderItemRow[];
}

export interface OrderCreateData {
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  table_number?: number | null;
  items: { menu_item_id?: number; id?: number; name?: string; quantity?: number; price?: number; total?: number }[];
  total_amount?: number;
  tax_amount?: number;
  tip_amount?: number;
  final_amount?: number;
  payment_method?: string | null;
  split_payment?: boolean;
  split_payment_method?: string | null;
  split_amount?: number;
  extra_charge?: number;
  extra_charge_note?: string | null;
  notes?: string | null;
  points_redeemed?: number;
  cafe_id?: number | null;
}

function parseOrderItems(items: unknown): OrderItemRow[] {
  if (!items) return [];
  if (Array.isArray(items)) {
    return items.filter((item: unknown) => item && (item as OrderItemRow).id !== null) as OrderItemRow[];
  }
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed)
        ? (parsed.filter((item: unknown) => item && (item as OrderItemRow).id !== null) as OrderItemRow[])
        : [];
    } catch {
      return [];
    }
  }
  if (typeof items === 'object') {
    return [(items as OrderItemRow)].filter((item) => item && item.id !== null);
  }
  return [];
}

function mapOrderRow(order: RowDataPacket): OrderRow {
  const items = parseOrderItems(order.items);
  return {
    ...order,
    items,
    total_amount: parseFloat(String(order.total_amount)),
    tax_amount: parseFloat(String(order.tax_amount)),
    tip_amount: parseFloat(String(order.tip_amount)),
    points_redeemed: parseInt(String(order.points_redeemed || 0), 10),
    points_awarded: Boolean(order.points_awarded),
    final_amount: parseFloat(String(order.final_amount)),
    split_payment: Boolean(order.split_payment),
    split_amount: parseFloat(String(order.split_amount || 0)),
    extra_charge: parseFloat(String(order.extra_charge || 0)),
    extra_charge_note: order.extra_charge_note || null
  } as OrderRow;
}

class Order {
  static async getAll(
    cafeId: number | null = null,
    options: { limit?: number; offset?: number } = {}
  ): Promise<OrderRow[]> {
    try {
      const hasCafeId = cafeId != null;
      const limit =
        options.limit != null && options.limit > 0 ? Math.min(options.limit, 100) : null;
      const offset = options.offset != null && options.offset >= 0 ? options.offset : 0;
      const params: (number | null)[] = hasCafeId ? [cafeId!] : [];
      const limitClause =
        limit != null
          ? ` LIMIT ${Math.max(0, parseInt(String(limit), 10) || 0)} OFFSET ${Math.max(0, parseInt(String(offset), 10) || 0)}`
          : '';
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT
          o.id, o.order_number, o.customer_id, o.customer_name, o.customer_email, o.customer_phone,
          o.table_number, o.total_amount, o.tax_amount, o.tip_amount, o.points_redeemed, o.points_awarded,
          o.final_amount, o.status, o.payment_method, o.split_payment, o.split_payment_method, o.split_amount,
          o.extra_charge, o.extra_charge_note, o.notes, o.created_at, o.updated_at, o.cafe_id,
          JSON_ARRAYAGG(
            JSON_OBJECT('id', oi.id, 'menu_item_id', oi.menu_item_id, 'name', COALESCE(mi.name, oi.item_name),
              'quantity', oi.quantity, 'price', oi.unit_price, 'total', oi.total_price)
          ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        ${hasCafeId ? 'WHERE o.cafe_id = ?' : ''}
        GROUP BY o.id
        ORDER BY o.created_at DESC${limitClause}`,
        params
      );
      return (rows as RowDataPacket[]).map(mapOrderRow);
    } catch (error) {
      logger.error('Error in getAll:', error);
      throw new Error(`Error fetching orders: ${(error as Error).message}`);
    }
  }

  static async getById(id: number, cafeId: number | null = null): Promise<OrderRow | null> {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT
          o.id, o.order_number, o.customer_id, o.customer_name, o.customer_email, o.customer_phone,
          o.table_number, o.total_amount, o.tax_amount, o.tip_amount, o.points_redeemed, o.points_awarded,
          o.final_amount, o.status, o.payment_method, o.split_payment, o.split_payment_method, o.split_amount,
          o.extra_charge, o.extra_charge_note, o.notes, o.created_at, o.updated_at, o.cafe_id,
          JSON_ARRAYAGG(
            JSON_OBJECT('id', oi.id, 'menu_item_id', oi.menu_item_id, 'name', COALESCE(mi.name, oi.item_name),
              'quantity', oi.quantity, 'price', oi.unit_price, 'total', oi.total_price)
          ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.id = ? ${hasCafeId ? 'AND o.cafe_id = ?' : ''}
        GROUP BY o.id`,
        hasCafeId ? [id, cafeId] : [id]
      );
      if (rows.length === 0) return null;
      return mapOrderRow(rows[0] as RowDataPacket);
    } catch (error) {
      throw new Error(`Error fetching order: ${(error as Error).message}`);
    }
  }

  static async create(orderData: OrderCreateData): Promise<OrderRow> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const {
        customer_name,
        customer_email,
        customer_phone,
        table_number,
        items,
        total_amount,
        tax_amount,
        tip_amount,
        final_amount,
        payment_method,
        split_payment,
        split_payment_method,
        split_amount,
        extra_charge,
        extra_charge_note,
        notes
      } = orderData;

      const orderNumber = `ORD${Date.now()}`;
      const safeCustomerName = customer_name || null;
      const safeCustomerEmail = customer_email || null;
      const safeCustomerPhone =
        customer_phone &&
        String(customer_phone).trim() !== '' &&
        String(customer_phone) !== 'undefined'
          ? customer_phone
          : null;
      const safeTotalAmount = total_amount || 0;
      const safeTaxAmount = tax_amount || 0;
      const safeTipAmount = tip_amount || 0;
      const safeFinalAmount = final_amount || 0;
      const safePaymentMethod = payment_method || null;
      const safeSplitPayment = Boolean(split_payment);
      const safeSplitPaymentMethod = split_payment_method || null;
      const safeSplitAmount = split_amount || 0;
      const safeExtraCharge = extra_charge || 0;
      const safeExtraChargeNote = extra_charge_note || null;
      const safeNotes = notes || null;

      const [cafeIdColumns] = await connection.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'orders'
        AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = cafeIdColumns.length > 0;
      const cafeId = orderData.cafe_id ?? null;

      let insertFields = [
        'order_number',
        'customer_id',
        'customer_name',
        'customer_email',
        'customer_phone',
        'table_number',
        'total_amount',
        'tax_amount',
        'tip_amount',
        'points_redeemed',
        'final_amount',
        'payment_method',
        'split_payment',
        'split_payment_method',
        'split_amount',
        'extra_charge',
        'extra_charge_note',
        'notes',
        'status'
      ];
      let insertValues: (string | number | boolean | null)[] = [
        orderNumber,
        null,
        safeCustomerName,
        safeCustomerEmail,
        safeCustomerPhone,
        table_number ?? null,
        safeTotalAmount,
        safeTaxAmount,
        safeTipAmount,
        orderData.points_redeemed || 0,
        safeFinalAmount,
        safePaymentMethod,
        safeSplitPayment,
        safeSplitPaymentMethod,
        safeSplitAmount,
        safeExtraCharge,
        safeExtraChargeNote,
        safeNotes,
        'pending'
      ];
      if (hasCafeId && cafeId) {
        insertFields.push('cafe_id');
        insertValues.push(cafeId);
      }

      const [orderResult] = await connection.execute<RowDataPacket[] & { insertId: number }>(
        `INSERT INTO orders (${insertFields.join(', ')}) VALUES (${insertFields.map(() => '?').join(', ')})`,
        insertValues
      );
      const orderId = orderResult.insertId;

      if (items && items.length > 0) {
        const itemRows = items.map((item) => {
          const safeMenuItemId = item.menu_item_id ?? item.id ?? null;
          const safeItemName = item.name ?? null;
          const safeQuantity = item.quantity || 0;
          const safeUnitPrice = item.price || 0;
          const safeTotalPrice = item.total || 0;
          return [orderId, safeMenuItemId, safeItemName, safeQuantity, safeUnitPrice, safeTotalPrice];
        });
        const placeholders = itemRows.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
        const flatParams = itemRows.flat();
        await connection.execute(
          `INSERT INTO order_items (order_id, menu_item_id, item_name, quantity, unit_price, total_price)
           VALUES ${placeholders}`,
          flatParams
        );
      }

      await connection.commit();
      const result = await this.getById(orderId, cafeId);
      if (!result) throw new Error('Failed to fetch created order');

      if (
        process.env.NODE_ENV !== 'test' &&
        hasCafeId &&
        cafeId &&
        result &&
        result.created_at
      ) {
        const orderDate = new Date(result.created_at).toISOString().split('T')[0];
        CafeDailyMetrics.incrementOrder(cafeId, orderDate, parseFloat(String(safeFinalAmount || 0)), false).catch(
          (err) => {
            logger.error('Error updating analytics metrics:', err);
          }
        );
      }
      return result;
    } catch (error) {
      logger.error('Error creating order:', error);
      await connection.rollback();
      throw new Error(`Error creating order: ${(error as Error).message}`);
    } finally {
      connection.release();
    }
  }

  static async updateStatus(
    id: number,
    status: string,
    cafeId: number | null = null
  ): Promise<OrderRow> {
    try {
      const hasCafeId = cafeId != null;
      const orderBefore = await this.getById(id, cafeId);
      if (!orderBefore) throw new Error('Order not found');
      const previousStatus = orderBefore.status;
      const orderCafeId = orderBefore.cafe_id ?? cafeId ?? null;
      const orderDate = orderBefore.created_at
        ? new Date(orderBefore.created_at).toISOString().split('T')[0]
        : null;
      const finalAmount = parseFloat(String(orderBefore.final_amount || 0));

      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(
        `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
        hasCafeId ? [status, id, cafeId] : [status, id]
      );
      if (result.affectedRows === 0) throw new Error('Order not found');

      const updatedOrder = await this.getById(id, cafeId);
      if (!updatedOrder) throw new Error('Order not found');

      if (process.env.NODE_ENV !== 'test' && orderCafeId && orderDate) {
        const wasCompleted = previousStatus === 'completed';
        const isNowCompleted = status === 'completed';
        if (wasCompleted !== isNowCompleted) {
          CafeDailyMetrics.updateOrderCompletion(
            orderCafeId,
            orderDate,
            finalAmount,
            isNowCompleted
          ).catch((err) => {
            logger.error('Error updating analytics metrics:', err);
          });
        }
      }
      return updatedOrder;
    } catch (error) {
      throw new Error(`Error updating order status: ${(error as Error).message}`);
    }
  }

  static async update(
    id: number,
    orderData: Partial<OrderCreateData> & {
      customer_name?: string | null;
      customer_email?: string | null;
      customer_phone?: string | null;
      items?: OrderItemRow[];
      total_amount?: number;
      tax_amount?: number;
      tip_amount?: number;
      final_amount?: number;
      payment_method?: string | null;
      split_payment?: boolean;
      split_payment_method?: string | null;
      split_amount?: number;
      extra_charge?: number;
      extra_charge_note?: string | null;
      notes?: string | null;
    },
    cafeId: number | null = null
  ): Promise<OrderRow> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const hasCafeId = cafeId != null;
      const {
        customer_name,
        customer_email,
        customer_phone,
        items,
        total_amount,
        tax_amount,
        tip_amount,
        final_amount,
        payment_method,
        split_payment,
        split_payment_method,
        split_amount,
        extra_charge,
        extra_charge_note,
        notes
      } = orderData;

      const safeCustomerName = customer_name ?? null;
      const safeCustomerEmail = customer_email ?? null;
      const safeCustomerPhone =
        customer_phone &&
        String(customer_phone).trim() !== '' &&
        String(customer_phone) !== 'undefined'
          ? customer_phone
          : null;
      const safeTotalAmount = total_amount ?? 0;
      const safeTaxAmount = tax_amount ?? 0;
      const safeTipAmount = tip_amount ?? 0;
      const safeFinalAmount = final_amount ?? 0;
      const safePaymentMethod = payment_method ?? null;
      const safeSplitPayment = Boolean(split_payment);
      const safeSplitPaymentMethod = split_payment_method ?? null;
      const safeSplitAmount = split_amount ?? 0;
      const safeExtraCharge = extra_charge ?? 0;
      const safeExtraChargeNote = extra_charge_note ?? null;
      const safeNotes = notes ?? null;

      const [orderResult] = await connection.execute<RowDataPacket[] & { affectedRows: number }>(
        `UPDATE orders SET
          customer_name = ?, customer_email = ?, customer_phone = ?,
          total_amount = ?, tax_amount = ?, tip_amount = ?, final_amount = ?,
          payment_method = ?, split_payment = ?, split_payment_method = ?, split_amount = ?,
          extra_charge = ?, extra_charge_note = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
        hasCafeId
          ? [
              safeCustomerName,
              safeCustomerEmail,
              safeCustomerPhone,
              safeTotalAmount,
              safeTaxAmount,
              safeTipAmount,
              safeFinalAmount,
              safePaymentMethod,
              safeSplitPayment,
              safeSplitPaymentMethod,
              safeSplitAmount,
              safeExtraCharge,
              safeExtraChargeNote,
              safeNotes,
              id,
              cafeId
            ]
          : [
              safeCustomerName,
              safeCustomerEmail,
              safeCustomerPhone,
              safeTotalAmount,
              safeTaxAmount,
              safeTipAmount,
              safeFinalAmount,
              safePaymentMethod,
              safeSplitPayment,
              safeSplitPaymentMethod,
              safeSplitAmount,
              safeExtraCharge,
              safeExtraChargeNote,
              safeNotes,
              id
            ]
      );
      if (orderResult.affectedRows === 0) throw new Error('Order not found');

      if (items && Array.isArray(items)) {
        await connection.execute('DELETE FROM order_items WHERE order_id = ?', [id]);
        for (const item of items) {
          const safeMenuItemId = item.menu_item_id ?? item.id ?? null;
          const safeItemName = item.name ?? null;
          const safeQuantity = item.quantity || 0;
          const safeUnitPrice = item.price || 0;
          const safeTotalPrice = item.total || 0;
          await connection.execute(
            `INSERT INTO order_items (order_id, menu_item_id, item_name, quantity, unit_price, total_price)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, safeMenuItemId, safeItemName, safeQuantity, safeUnitPrice, safeTotalPrice]
          );
        }
      }

      await connection.commit();
      const result = await this.getById(id, cafeId);
      if (!result) throw new Error('Order not found');
      return result;
    } catch (error) {
      logger.error('Error updating order:', error);
      await connection.rollback();
      throw new Error(`Error updating order: ${(error as Error).message}`);
    } finally {
      connection.release();
    }
  }

  static async markPointsAwarded(id: number, cafeId: number | null = null): Promise<OrderRow> {
    try {
      const hasCafeId = cafeId != null;
      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(
        `UPDATE orders SET points_awarded = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
        hasCafeId ? [id, cafeId] : [id]
      );
      if (result.affectedRows === 0) throw new Error('Order not found');
      const order = await this.getById(id, cafeId);
      if (!order) throw new Error('Order not found');
      return order;
    } catch (error) {
      throw new Error(`Error marking points as awarded: ${(error as Error).message}`);
    }
  }

  static async getByCustomerPhone(
    customerPhone: string,
    cafeId: number | null = null
  ): Promise<OrderRow[]> {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT o.id, o.order_number, o.customer_name, o.customer_email, o.customer_phone,
          o.total_amount, o.tax_amount, o.tip_amount, o.final_amount, o.status, o.payment_method, o.notes,
          o.created_at, o.updated_at,
          JSON_ARRAYAGG(JSON_OBJECT('id', oi.id, 'menu_item_id', oi.menu_item_id, 'name', COALESCE(mi.name, oi.item_name),
            'quantity', oi.quantity, 'price', oi.unit_price, 'total', oi.total_price)) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.customer_phone = ? ${hasCafeId ? 'AND o.cafe_id = ?' : ''}
        GROUP BY o.id
        ORDER BY o.created_at DESC`,
        hasCafeId ? [customerPhone, cafeId] : [customerPhone]
      );
      return (rows as RowDataPacket[]).map((order) => ({
        ...order,
        items: parseOrderItems(order.items),
        total_amount: parseFloat(String(order.total_amount)),
        tax_amount: parseFloat(String(order.tax_amount)),
        tip_amount: parseFloat(String(order.tip_amount)),
        final_amount: parseFloat(String(order.final_amount))
      })) as OrderRow[];
    } catch (error) {
      throw new Error(`Error fetching orders by customer phone: ${(error as Error).message}`);
    }
  }

  static async getByOrderNumber(
    orderNumber: string,
    cafeId: number | null = null
  ): Promise<OrderRow[]> {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT o.id, o.order_number, o.customer_name, o.customer_email, o.customer_phone,
          o.total_amount, o.tax_amount, o.tip_amount, o.final_amount, o.status, o.payment_method, o.notes,
          o.created_at, o.updated_at,
          JSON_ARRAYAGG(JSON_OBJECT('id', oi.id, 'menu_item_id', oi.menu_item_id, 'name', COALESCE(mi.name, oi.item_name),
            'quantity', oi.quantity, 'price', oi.unit_price, 'total', oi.total_price)) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.order_number = ? ${hasCafeId ? 'AND o.cafe_id = ?' : ''}
        GROUP BY o.id
        ORDER BY o.created_at DESC`,
        hasCafeId ? [orderNumber, cafeId] : [orderNumber]
      );
      return (rows as RowDataPacket[]).map((order) => ({
        ...order,
        items: parseOrderItems(order.items),
        total_amount: parseFloat(String(order.total_amount)),
        tax_amount: parseFloat(String(order.tax_amount)),
        tip_amount: parseFloat(String(order.tip_amount)),
        final_amount: parseFloat(String(order.final_amount))
      })) as OrderRow[];
    } catch (error) {
      throw new Error(`Error fetching orders by order number: ${(error as Error).message}`);
    }
  }

  static async getByStatus(status: string, cafeId: number | null = null): Promise<OrderRow[]> {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT o.id, o.order_number, o.customer_name, o.customer_email, o.customer_phone,
          o.total_amount, o.tax_amount, o.tip_amount, o.final_amount, o.status, o.payment_method, o.notes,
          o.created_at, o.updated_at,
          JSON_ARRAYAGG(JSON_OBJECT('id', oi.id, 'menu_item_id', oi.menu_item_id, 'name', COALESCE(mi.name, oi.item_name),
            'quantity', oi.quantity, 'price', oi.unit_price, 'total', oi.total_price)) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.status = ? ${hasCafeId ? 'AND o.cafe_id = ?' : ''}
        GROUP BY o.id
        ORDER BY o.created_at ASC`,
        hasCafeId ? [status, cafeId] : [status]
      );
      return (rows as RowDataPacket[]).map((order) => ({
        ...order,
        items: parseOrderItems(order.items),
        total_amount: parseFloat(String(order.total_amount)),
        tax_amount: parseFloat(String(order.tax_amount)),
        tip_amount: parseFloat(String(order.tip_amount)),
        final_amount: parseFloat(String(order.final_amount))
      })) as OrderRow[];
    } catch (error) {
      throw new Error(`Error fetching orders by status: ${(error as Error).message}`);
    }
  }

  static async getStatistics(cafeId: number | null = null): Promise<{
    total: number;
    pending: number;
    preparing: number;
    ready: number;
    completed: number;
  }> {
    try {
      const hasCafeId = cafeId != null;
      const whereClause = hasCafeId ? ' WHERE cafe_id = ?' : '';
      const params: number[] = hasCafeId ? [cafeId!] : [];
      const [totalOrders] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM orders${whereClause}`,
        params
      );
      const [pendingOrders] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM orders WHERE status = 'pending'${hasCafeId ? ' AND cafe_id = ?' : ''}`,
        params
      );
      const [preparingOrders] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM orders WHERE status = 'preparing'${hasCafeId ? ' AND cafe_id = ?' : ''}`,
        params
      );
      const [readyOrders] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM orders WHERE status = 'ready'${hasCafeId ? ' AND cafe_id = ?' : ''}`,
        params
      );
      const [completedOrders] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM orders WHERE status = 'completed'${hasCafeId ? ' AND cafe_id = ?' : ''}`,
        params
      );
      return {
        total: (totalOrders[0] as RowDataPacket).count as number,
        pending: (pendingOrders[0] as RowDataPacket).count as number,
        preparing: (preparingOrders[0] as RowDataPacket).count as number,
        ready: (readyOrders[0] as RowDataPacket).count as number,
        completed: (completedOrders[0] as RowDataPacket).count as number
      };
    } catch (error) {
      throw new Error(`Error fetching order statistics: ${(error as Error).message}`);
    }
  }
}

export default Order;
