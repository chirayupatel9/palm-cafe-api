import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';

export interface InvoiceItemRow {
  menu_item_id: number;
  item_name: string;
  price: number;
  quantity: number;
  total: number;
}

export interface InvoiceRow {
  invoice_number: string;
  order_id?: number | null;
  cafe_id?: number | null;
  customer_name: string;
  customer_phone?: string | null;
  payment_method?: string | null;
  subtotal: number;
  tax_amount: number;
  tip_amount: number;
  total_amount: number;
  invoice_date?: Date | string | null;
  created_at?: Date;
  order_number?: string | null;
  items: InvoiceItemRow[];
}

export interface InvoiceCreateData {
  invoiceNumber: string;
  order_id?: number | null;
  customerName: string;
  customerPhone?: string | null;
  paymentMethod?: string;
  items: { id: number; name: string; price: number; quantity: number; total: number }[];
  subtotal: number;
  taxAmount?: number;
  tipAmount?: number;
  total: number;
  date?: string | Date;
  cafe_id?: number | null;
}

class Invoice {
  static async getAll(
    cafeId: number | null = null,
    options: { limit?: number; offset?: number } = {}
  ): Promise<InvoiceRow[]> {
    try {
      const limit =
        options.limit != null && options.limit > 0 ? Math.min(options.limit, 100) : null;
      const offset = options.offset != null && options.offset >= 0 ? options.offset : 0;

      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'invoices'
      `);
      const existingColumns = (columns as RowDataPacket[]).map((col) => col.COLUMN_NAME as string);
      const hasOrderId = existingColumns.includes('order_id');
      const hasCafeId = existingColumns.includes('cafe_id');
      const hasSubtotal = existingColumns.includes('subtotal');
      const hasTaxAmount = existingColumns.includes('tax_amount');
      const hasTipAmount = existingColumns.includes('tip_amount');
      const hasPaymentMethod = existingColumns.includes('payment_method');
      const hasInvoiceDate = existingColumns.includes('invoice_date');
      const hasTotalAmount = existingColumns.includes('total_amount');
      const hasTotal = existingColumns.includes('total');

      const selectFields = ['i.invoice_number'];
      if (hasOrderId) selectFields.push('i.order_id');
      if (hasCafeId) selectFields.push('i.cafe_id');
      selectFields.push('i.customer_name');
      if (existingColumns.includes('customer_phone')) selectFields.push('i.customer_phone');
      if (hasPaymentMethod) selectFields.push('i.payment_method');
      if (hasSubtotal) selectFields.push('i.subtotal');
      if (hasTaxAmount) selectFields.push('i.tax_amount');
      if (hasTipAmount) selectFields.push('i.tip_amount');
      if (hasTotalAmount) selectFields.push('i.total_amount');
      else if (hasTotal) selectFields.push('i.total as total_amount');
      if (hasInvoiceDate) selectFields.push('i.invoice_date');
      else if (existingColumns.includes('date')) selectFields.push('i.date as invoice_date');
      selectFields.push('i.created_at');
      if (hasOrderId) selectFields.push('o.order_number');

      let query = `SELECT ${selectFields.join(', ')} FROM invoices i`;
      const params: (number | null)[] = [];
      if (hasOrderId) query += ' LEFT JOIN orders o ON i.order_id = o.id';
      if (hasCafeId && cafeId) {
        query += ' WHERE i.cafe_id = ?';
        params.push(cafeId);
      }
      if (hasInvoiceDate) query += ' ORDER BY i.invoice_date DESC';
      else if (existingColumns.includes('date')) query += ' ORDER BY i.date DESC';
      else query += ' ORDER BY i.created_at DESC';
      if (limit != null) {
        const lim = Math.max(0, parseInt(String(limit), 10) || 0);
        const off = Math.max(0, parseInt(String(offset), 10) || 0);
        query += ` LIMIT ${lim} OFFSET ${off}`;
      }

      const [invoices] = await pool.execute<RowDataPacket[]>(query, params);

      const invoicesWithItems = await Promise.all(
        (invoices as RowDataPacket[]).map(async (invoice: RowDataPacket) => {
          const [items] = await pool.execute<RowDataPacket[]>(
            `SELECT menu_item_id, item_name, price, quantity, total FROM invoice_items WHERE invoice_number = ?`,
            [invoice.invoice_number]
          );
          const inv = invoice as Record<string, unknown>;
          return {
            ...invoice,
            subtotal: inv.subtotal ? parseFloat(String(inv.subtotal)) : 0,
            tax_amount: inv.tax_amount ? parseFloat(String(inv.tax_amount)) : 0,
            tip_amount: inv.tip_amount ? parseFloat(String(inv.tip_amount)) : 0,
            total_amount: inv.total_amount
              ? parseFloat(String(inv.total_amount))
              : inv.total
                ? parseFloat(String(inv.total))
                : 0,
            items: (items as RowDataPacket[]).map((item: RowDataPacket) => ({
              ...item,
              price: parseFloat(String(item.price)),
              total: parseFloat(String(item.total))
            }))
          };
        })
      );
      return invoicesWithItems as InvoiceRow[];
    } catch (error) {
      throw new Error(`Error fetching invoices: ${(error as Error).message}`);
    }
  }

  static async getByNumber(
    invoiceNumber: string,
    cafeId: number | null = null
  ): Promise<InvoiceRow | null> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices'
      `);
      const existingColumns = (columns as RowDataPacket[]).map((col) => col.COLUMN_NAME as string);
      const hasOrderId = existingColumns.includes('order_id');
      const hasCafeId = existingColumns.includes('cafe_id');
      const hasSubtotal = existingColumns.includes('subtotal');
      const hasTaxAmount = existingColumns.includes('tax_amount');
      const hasTipAmount = existingColumns.includes('tip_amount');
      const hasPaymentMethod = existingColumns.includes('payment_method');
      const hasInvoiceDate = existingColumns.includes('invoice_date');
      const hasTotalAmount = existingColumns.includes('total_amount');
      const hasTotal = existingColumns.includes('total');

      const selectFields = ['i.invoice_number'];
      if (hasOrderId) selectFields.push('i.order_id');
      if (hasCafeId) selectFields.push('i.cafe_id');
      selectFields.push('i.customer_name');
      if (existingColumns.includes('customer_phone')) selectFields.push('i.customer_phone');
      if (hasPaymentMethod) selectFields.push('i.payment_method');
      if (hasSubtotal) selectFields.push('i.subtotal');
      if (hasTaxAmount) selectFields.push('i.tax_amount');
      if (hasTipAmount) selectFields.push('i.tip_amount');
      if (hasTotalAmount) selectFields.push('i.total_amount');
      else if (hasTotal) selectFields.push('i.total as total_amount');
      if (hasInvoiceDate) selectFields.push('i.invoice_date');
      else if (existingColumns.includes('date')) selectFields.push('i.date as invoice_date');
      selectFields.push('i.created_at');
      if (hasOrderId) selectFields.push('o.order_number');

      let query = `SELECT ${selectFields.join(', ')} FROM invoices i`;
      if (hasOrderId) query += ' LEFT JOIN orders o ON i.order_id = o.id';
      query += ' WHERE i.invoice_number = ?';
      const params: (string | number)[] = [invoiceNumber];
      if (hasCafeId && cafeId != null) {
        query += ' AND i.cafe_id = ?';
        params.push(cafeId);
      }

      const [invoices] = await pool.execute<RowDataPacket[]>(query, params);
      if (invoices.length === 0) return null;

      const invoice = invoices[0] as RowDataPacket;
      const [items] = await pool.execute<RowDataPacket[]>(
        `SELECT menu_item_id, item_name, price, quantity, total FROM invoice_items WHERE invoice_number = ?`,
        [invoiceNumber]
      );
      return {
        ...invoice,
        subtotal: parseFloat(String(invoice.subtotal)),
        tax_amount: parseFloat(String(invoice.tax_amount)),
        tip_amount: parseFloat(String(invoice.tip_amount)),
        total_amount: parseFloat(String(invoice.total_amount)),
        items: (items as RowDataPacket[]).map((item: RowDataPacket) => ({
          ...item,
          price: parseFloat(String(item.price)),
          total: parseFloat(String(item.total))
        }))
      } as InvoiceRow;
    } catch (error) {
      throw new Error(`Error fetching invoice: ${(error as Error).message}`);
    }
  }

  static async getByOrderNumber(
    orderNumber: string,
    cafeId: number | null = null
  ): Promise<InvoiceRow | null> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'order_id'
      `);
      if (columns.length === 0) return null;

      const [allColumns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices'
      `);
      const existingColumns = (allColumns as RowDataPacket[]).map((col) => col.COLUMN_NAME as string);
      const hasCafeId = existingColumns.includes('cafe_id');
      const hasSubtotal = existingColumns.includes('subtotal');
      const hasTaxAmount = existingColumns.includes('tax_amount');
      const hasTipAmount = existingColumns.includes('tip_amount');
      const hasPaymentMethod = existingColumns.includes('payment_method');
      const hasInvoiceDate = existingColumns.includes('invoice_date');
      const hasTotalAmount = existingColumns.includes('total_amount');
      const hasTotal = existingColumns.includes('total');

      const selectFields = ['i.invoice_number', 'i.order_id'];
      if (hasCafeId) selectFields.push('i.cafe_id');
      selectFields.push('i.customer_name');
      if (existingColumns.includes('customer_phone')) selectFields.push('i.customer_phone');
      if (hasPaymentMethod) selectFields.push('i.payment_method');
      if (hasSubtotal) selectFields.push('i.subtotal');
      if (hasTaxAmount) selectFields.push('i.tax_amount');
      if (hasTipAmount) selectFields.push('i.tip_amount');
      if (hasTotalAmount) selectFields.push('i.total_amount');
      else if (hasTotal) selectFields.push('i.total as total_amount');
      if (hasInvoiceDate) selectFields.push('i.invoice_date');
      else if (existingColumns.includes('date')) selectFields.push('i.date as invoice_date');
      selectFields.push('i.created_at', 'o.order_number');

      let query = `SELECT ${selectFields.join(', ')} FROM invoices i LEFT JOIN orders o ON i.order_id = o.id WHERE o.order_number = ?`;
      const params: (string | number)[] = [orderNumber];
      if (hasCafeId && cafeId != null) {
        query += ' AND i.cafe_id = ?';
        params.push(cafeId);
      }

      const [invoices] = await pool.execute<RowDataPacket[]>(query, params);
      if (invoices.length === 0) return null;

      const invoice = invoices[0] as RowDataPacket;
      const [items] = await pool.execute<RowDataPacket[]>(
        `SELECT menu_item_id, item_name, price, quantity, total FROM invoice_items WHERE invoice_number = ?`,
        [invoice.invoice_number]
      );
      return {
        ...invoice,
        subtotal: parseFloat(String(invoice.subtotal)),
        tax_amount: parseFloat(String(invoice.tax_amount)),
        tip_amount: parseFloat(String(invoice.tip_amount)),
        total_amount: parseFloat(String(invoice.total_amount)),
        items: (items as RowDataPacket[]).map((item: RowDataPacket) => ({
          ...item,
          price: parseFloat(String(item.price)),
          total: parseFloat(String(item.total))
        }))
      } as InvoiceRow;
    } catch (error) {
      throw new Error(`Error fetching invoice by order number: ${(error as Error).message}`);
    }
  }

  static async create(invoiceData: InvoiceCreateData): Promise<{
    invoiceNumber: string;
    customerName: string;
    customerPhone?: string | null;
    paymentMethod: string;
    items: { id: number; name: string; price: number; quantity: number; total: number }[];
    subtotal: number;
    tax_amount: number;
    tip_amount: number;
    total_amount: number;
    invoice_date: string;
  }> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const {
        invoiceNumber,
        order_id,
        customerName,
        customerPhone,
        paymentMethod,
        items,
        subtotal,
        taxAmount,
        tipAmount,
        total,
        date,
        cafe_id
      } = invoiceData;

      const mysqlDate = new Date(date || new Date()).toISOString().slice(0, 19).replace('T', ' ');

      const [columns] = await connection.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices'
      `);
      const existingColumns = (columns as RowDataPacket[]).map((col) => col.COLUMN_NAME as string);
      const hasOrderId = existingColumns.includes('order_id');
      const hasCafeId = existingColumns.includes('cafe_id');
      const hasSubtotal = existingColumns.includes('subtotal');
      const hasTaxAmount = existingColumns.includes('tax_amount');
      const hasTipAmount = existingColumns.includes('tip_amount');
      const hasPaymentMethod = existingColumns.includes('payment_method');
      const hasInvoiceDate = existingColumns.includes('invoice_date');

      const insertFields = ['invoice_number'];
      const insertValues: (string | number | null)[] = [invoiceNumber];
      const placeholders = ['?'];

      if (hasOrderId) {
        insertFields.push('order_id');
        insertValues.push(order_id ?? null);
        placeholders.push('?');
      }
      if (hasCafeId && cafe_id) {
        insertFields.push('cafe_id');
        insertValues.push(cafe_id);
        placeholders.push('?');
      }
      insertFields.push('customer_name');
      insertValues.push(customerName);
      placeholders.push('?');
      if (existingColumns.includes('customer_phone')) {
        insertFields.push('customer_phone');
        insertValues.push(customerPhone ?? null);
        placeholders.push('?');
      }
      if (hasPaymentMethod) {
        insertFields.push('payment_method');
        insertValues.push(paymentMethod || 'cash');
        placeholders.push('?');
      }
      if (hasSubtotal) {
        insertFields.push('subtotal');
        insertValues.push(subtotal || 0);
        placeholders.push('?');
      }
      if (hasTaxAmount) {
        insertFields.push('tax_amount');
        insertValues.push(taxAmount || 0);
        placeholders.push('?');
      }
      if (hasTipAmount) {
        insertFields.push('tip_amount');
        insertValues.push(tipAmount || 0);
        placeholders.push('?');
      }
      if (existingColumns.includes('total_amount')) {
        insertFields.push('total_amount');
        insertValues.push(total);
        placeholders.push('?');
      } else if (existingColumns.includes('total')) {
        insertFields.push('total');
        insertValues.push(total);
        placeholders.push('?');
      }
      if (hasInvoiceDate) {
        insertFields.push('invoice_date');
        insertValues.push(mysqlDate);
        placeholders.push('?');
      } else if (existingColumns.includes('date')) {
        insertFields.push('date');
        insertValues.push(mysqlDate);
        placeholders.push('?');
      }

      await connection.execute(
        `INSERT INTO invoices (${insertFields.join(', ')}) VALUES (${placeholders.join(', ')})`,
        insertValues
      );

      for (const item of items) {
        await connection.execute(
          `INSERT INTO invoice_items (invoice_number, menu_item_id, item_name, price, quantity, total)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [invoiceNumber, item.id, item.name, item.price, item.quantity, item.total]
        );
      }

      await connection.commit();
      const invoiceDate =
        typeof date === 'string' ? date : date instanceof Date ? date.toISOString() : new Date().toISOString();
      return {
        invoiceNumber,
        customerName,
        customerPhone: customerPhone ?? null,
        paymentMethod: paymentMethod || 'cash',
        items,
        subtotal: parseFloat(String(subtotal)),
        tax_amount: parseFloat(String(taxAmount)),
        tip_amount: parseFloat(String(tipAmount)),
        total_amount: parseFloat(String(total)),
        invoice_date: invoiceDate
      };
    } catch (error) {
      await connection.rollback();
      throw new Error(`Error creating invoice: ${(error as Error).message}`);
    } finally {
      connection.release();
    }
  }

  static async getNextInvoiceNumber(): Promise<string> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(`
        SELECT MAX(CAST(invoice_number AS UNSIGNED)) as maxNumber FROM invoices
      `);
      const maxNumber = (rows[0] as RowDataPacket).maxNumber || 999;
      return (maxNumber + 1).toString();
    } catch (error) {
      throw new Error(`Error getting next invoice number: ${(error as Error).message}`);
    }
  }

  static async getStatistics(cafeId: number | null = null): Promise<{
    totalRevenue: number;
    totalOrders: number;
    uniqueCustomers: number;
    totalTips: number;
    totalTax: number;
  }> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices'
      `);
      const existingColumns = (columns as RowDataPacket[]).map((col) => col.COLUMN_NAME as string);
      const hasCafeId = existingColumns.includes('cafe_id');
      const hasTotalAmount = existingColumns.includes('total_amount');
      const hasTotal = existingColumns.includes('total');
      const hasTipAmount = existingColumns.includes('tip_amount');
      const hasTaxAmount = existingColumns.includes('tax_amount');

      const whereClause = hasCafeId && cafeId != null ? ' WHERE cafe_id = ?' : '';
      const params = hasCafeId && cafeId != null ? [cafeId] : [];

      let revenueColumn = '0';
      if (hasTotalAmount) revenueColumn = 'SUM(total_amount)';
      else if (hasTotal) revenueColumn = 'SUM(total)';

      const [totalRevenue] = await pool.execute<RowDataPacket[]>(
        `SELECT ${revenueColumn} as totalRevenue FROM invoices${whereClause}`,
        params
      );
      const [totalOrders] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as totalOrders FROM invoices${whereClause}`,
        params
      );
      const [uniqueCustomers] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT customer_name) as uniqueCustomers FROM invoices${whereClause}`,
        params
      );
      let tipsColumn = '0';
      if (hasTipAmount) tipsColumn = 'SUM(tip_amount)';
      const [totalTips] = await pool.execute<RowDataPacket[]>(
        `SELECT ${tipsColumn} as totalTips FROM invoices${whereClause}`,
        params
      );
      let taxColumn = '0';
      if (hasTaxAmount) taxColumn = 'SUM(tax_amount)';
      const [totalTax] = await pool.execute<RowDataPacket[]>(
        `SELECT ${taxColumn} as totalTax FROM invoices${whereClause}`,
        params
      );

      const revRow = totalRevenue[0] as RowDataPacket;
      const ordRow = totalOrders[0] as RowDataPacket;
      const custRow = uniqueCustomers[0] as RowDataPacket;
      const tipsRow = totalTips[0] as RowDataPacket;
      const taxRow = totalTax[0] as RowDataPacket;

      return {
        totalRevenue: parseFloat(String(revRow?.totalRevenue)) || 0,
        totalOrders: Number(ordRow?.totalOrders) || 0,
        uniqueCustomers: Number(custRow?.uniqueCustomers) || 0,
        totalTips: parseFloat(String(tipsRow?.totalTips)) || 0,
        totalTax: parseFloat(String(taxRow?.totalTax)) || 0
      };
    } catch (error) {
      throw new Error(`Error fetching statistics: ${(error as Error).message}`);
    }
  }
}

export default Invoice;
