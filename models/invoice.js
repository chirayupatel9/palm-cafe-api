const { pool } = require('../config/database');

class Invoice {
  // Get all invoices with items (optionally filtered by cafeId)
  static async getAll(cafeId = null) {
    try {
      // Check which columns exist
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'invoices'
      `);
      
      const existingColumns = columns.map(col => col.COLUMN_NAME);
      const hasOrderId = existingColumns.includes('order_id');
      const hasCafeId = existingColumns.includes('cafe_id');
      const hasSubtotal = existingColumns.includes('subtotal');
      const hasTaxAmount = existingColumns.includes('tax_amount');
      const hasTipAmount = existingColumns.includes('tip_amount');
      const hasPaymentMethod = existingColumns.includes('payment_method');
      const hasInvoiceDate = existingColumns.includes('invoice_date');
      const hasTotalAmount = existingColumns.includes('total_amount');
      const hasTotal = existingColumns.includes('total');

      // Build SELECT query dynamically
      const selectFields = ['i.invoice_number'];
      
      if (hasOrderId) {
        selectFields.push('i.order_id');
      }
      
      if (hasCafeId) {
        selectFields.push('i.cafe_id');
      }
      
      selectFields.push('i.customer_name');
      
      if (existingColumns.includes('customer_phone')) {
        selectFields.push('i.customer_phone');
      }
      
      if (hasPaymentMethod) {
        selectFields.push('i.payment_method');
      }
      
      if (hasSubtotal) {
        selectFields.push('i.subtotal');
      }
      
      if (hasTaxAmount) {
        selectFields.push('i.tax_amount');
      }
      
      if (hasTipAmount) {
        selectFields.push('i.tip_amount');
      }
      
      if (hasTotalAmount) {
        selectFields.push('i.total_amount');
      } else if (hasTotal) {
        selectFields.push('i.total as total_amount');
      }
      
      if (hasInvoiceDate) {
        selectFields.push('i.invoice_date');
      } else if (existingColumns.includes('date')) {
        selectFields.push('i.date as invoice_date');
      }
      
      selectFields.push('i.created_at');
      
      if (hasOrderId) {
        selectFields.push('o.order_number');
      }

      let query = `
        SELECT ${selectFields.join(', ')}
        FROM invoices i
      `;
      
      const params = [];
      
      if (hasOrderId) {
        query += ' LEFT JOIN orders o ON i.order_id = o.id';
      }
      
      if (hasCafeId && cafeId) {
        query += ' WHERE i.cafe_id = ?';
        params.push(cafeId);
      }
      
      if (hasInvoiceDate) {
        query += ' ORDER BY i.invoice_date DESC';
      } else if (existingColumns.includes('date')) {
        query += ' ORDER BY i.date DESC';
      } else {
        query += ' ORDER BY i.created_at DESC';
      }

      const [invoices] = await pool.execute(query, params);

      // Get items for each invoice
      const invoicesWithItems = await Promise.all(
        invoices.map(async (invoice) => {
          const [items] = await pool.execute(`
            SELECT 
              menu_item_id,
              item_name,
              price,
              quantity,
              total
            FROM invoice_items 
            WHERE invoice_number = ?
          `, [invoice.invoice_number]);

          return {
            ...invoice,
            subtotal: invoice.subtotal ? parseFloat(invoice.subtotal) : 0,
            tax_amount: invoice.tax_amount ? parseFloat(invoice.tax_amount) : 0,
            tip_amount: invoice.tip_amount ? parseFloat(invoice.tip_amount) : 0,
            total_amount: invoice.total_amount ? parseFloat(invoice.total_amount) : (invoice.total ? parseFloat(invoice.total) : 0),
            items: items.map(item => ({
              ...item,
              price: parseFloat(item.price),
              total: parseFloat(item.total)
            }))
          };
        })
      );

      return invoicesWithItems;
    } catch (error) {
      throw new Error(`Error fetching invoices: ${error.message}`);
    }
  }

  // Get invoice by number
  static async getByNumber(invoiceNumber) {
    try {
      // Check which columns exist
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'invoices'
      `);
      
      const existingColumns = columns.map(col => col.COLUMN_NAME);
      const hasOrderId = existingColumns.includes('order_id');
      const hasSubtotal = existingColumns.includes('subtotal');
      const hasTaxAmount = existingColumns.includes('tax_amount');
      const hasTipAmount = existingColumns.includes('tip_amount');
      const hasPaymentMethod = existingColumns.includes('payment_method');
      const hasInvoiceDate = existingColumns.includes('invoice_date');
      const hasTotalAmount = existingColumns.includes('total_amount');
      const hasTotal = existingColumns.includes('total');

      const selectFields = ['i.invoice_number'];
      
      if (hasOrderId) {
        selectFields.push('i.order_id');
      }
      
      selectFields.push('i.customer_name');
      
      if (existingColumns.includes('customer_phone')) {
        selectFields.push('i.customer_phone');
      }
      
      if (hasPaymentMethod) {
        selectFields.push('i.payment_method');
      }
      
      if (hasSubtotal) {
        selectFields.push('i.subtotal');
      }
      
      if (hasTaxAmount) {
        selectFields.push('i.tax_amount');
      }
      
      if (hasTipAmount) {
        selectFields.push('i.tip_amount');
      }
      
      if (hasTotalAmount) {
        selectFields.push('i.total_amount');
      } else if (hasTotal) {
        selectFields.push('i.total as total_amount');
      }
      
      if (hasInvoiceDate) {
        selectFields.push('i.invoice_date');
      } else if (existingColumns.includes('date')) {
        selectFields.push('i.date as invoice_date');
      }
      
      selectFields.push('i.created_at');
      
      if (hasOrderId) {
        selectFields.push('o.order_number');
      }

      let query = `
        SELECT ${selectFields.join(', ')}
        FROM invoices i
      `;
      
      if (hasOrderId) {
        query += ' LEFT JOIN orders o ON i.order_id = o.id';
      }
      
      query += ' WHERE i.invoice_number = ?';

      const [invoices] = await pool.execute(query, [invoiceNumber]);

      if (invoices.length === 0) {
        return null;
      }

      const invoice = invoices[0];

      // Get items for the invoice
      const [items] = await pool.execute(`
        SELECT 
          menu_item_id,
          item_name,
          price,
          quantity,
          total
        FROM invoice_items 
        WHERE invoice_number = ?
      `, [invoiceNumber]);

      return {
        ...invoice,
        subtotal: parseFloat(invoice.subtotal),
        tax_amount: parseFloat(invoice.tax_amount),
        tip_amount: parseFloat(invoice.tip_amount),
        total_amount: parseFloat(invoice.total_amount),
        items: items.map(item => ({
          ...item,
          price: parseFloat(item.price),
          total: parseFloat(item.total)
        }))
      };
    } catch (error) {
      throw new Error(`Error fetching invoice: ${error.message}`);
    }
  }

  // Get invoice by order number
  static async getByOrderNumber(orderNumber) {
    try {
      // Check if order_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'invoices'
        AND COLUMN_NAME = 'order_id'
      `);
      
      if (columns.length === 0) {
        // order_id doesn't exist, can't query by order number
        return null;
      }

      // Check which columns exist
      const [allColumns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'invoices'
      `);
      
      const existingColumns = allColumns.map(col => col.COLUMN_NAME);
      const hasSubtotal = existingColumns.includes('subtotal');
      const hasTaxAmount = existingColumns.includes('tax_amount');
      const hasTipAmount = existingColumns.includes('tip_amount');
      const hasPaymentMethod = existingColumns.includes('payment_method');
      const hasInvoiceDate = existingColumns.includes('invoice_date');
      const hasTotalAmount = existingColumns.includes('total_amount');
      const hasTotal = existingColumns.includes('total');

      const selectFields = ['i.invoice_number', 'i.order_id'];
      selectFields.push('i.customer_name');
      
      if (existingColumns.includes('customer_phone')) {
        selectFields.push('i.customer_phone');
      }
      
      if (hasPaymentMethod) {
        selectFields.push('i.payment_method');
      }
      
      if (hasSubtotal) {
        selectFields.push('i.subtotal');
      }
      
      if (hasTaxAmount) {
        selectFields.push('i.tax_amount');
      }
      
      if (hasTipAmount) {
        selectFields.push('i.tip_amount');
      }
      
      if (hasTotalAmount) {
        selectFields.push('i.total_amount');
      } else if (hasTotal) {
        selectFields.push('i.total as total_amount');
      }
      
      if (hasInvoiceDate) {
        selectFields.push('i.invoice_date');
      } else if (existingColumns.includes('date')) {
        selectFields.push('i.date as invoice_date');
      }
      
      selectFields.push('i.created_at', 'o.order_number');

      const [invoices] = await pool.execute(`
        SELECT ${selectFields.join(', ')}
        FROM invoices i
        LEFT JOIN orders o ON i.order_id = o.id
        WHERE o.order_number = ?
      `, [orderNumber]);

      if (invoices.length === 0) {
        return null;
      }

      const invoice = invoices[0];

      // Get items for the invoice
      const [items] = await pool.execute(`
        SELECT 
          menu_item_id,
          item_name,
          price,
          quantity,
          total
        FROM invoice_items 
        WHERE invoice_number = ?
      `, [invoice.invoice_number]);

      return {
        ...invoice,
        subtotal: parseFloat(invoice.subtotal),
        tax_amount: parseFloat(invoice.tax_amount),
        tip_amount: parseFloat(invoice.tip_amount),
        total_amount: parseFloat(invoice.total_amount),
        items: items.map(item => ({
          ...item,
          price: parseFloat(item.price),
          total: parseFloat(item.total)
        }))
      };
    } catch (error) {
      throw new Error(`Error fetching invoice by order number: ${error.message}`);
    }
  }

  // Create new invoice with items
  static async create(invoiceData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { invoiceNumber, order_id, customerName, customerPhone, paymentMethod, items, subtotal, taxAmount, tipAmount, total, date, cafe_id } = invoiceData;

      // Convert ISO datetime to MySQL datetime format
      const mysqlDate = new Date(date || new Date()).toISOString().slice(0, 19).replace('T', ' ');

      // Check which columns exist in the invoices table
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'invoices'
      `);
      
      const existingColumns = columns.map(col => col.COLUMN_NAME);
      const hasOrderId = existingColumns.includes('order_id');
      const hasCafeId = existingColumns.includes('cafe_id');
      const hasSubtotal = existingColumns.includes('subtotal');
      const hasTaxAmount = existingColumns.includes('tax_amount');
      const hasTipAmount = existingColumns.includes('tip_amount');
      const hasPaymentMethod = existingColumns.includes('payment_method');
      const hasInvoiceDate = existingColumns.includes('invoice_date');

      // Build dynamic INSERT query based on existing columns
      const insertFields = ['invoice_number'];
      const insertValues = [invoiceNumber];
      const placeholders = ['?'];

      if (hasOrderId) {
        insertFields.push('order_id');
        insertValues.push(order_id || null);
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
        insertValues.push(customerPhone || null);
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

      // Use total_amount or total depending on what exists
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

      // Insert invoice
      await connection.execute(`
        INSERT INTO invoices (${insertFields.join(', ')})
        VALUES (${placeholders.join(', ')})
      `, insertValues);

      // Insert invoice items
      for (const item of items) {
        await connection.execute(`
          INSERT INTO invoice_items (invoice_number, menu_item_id, item_name, price, quantity, total)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [invoiceNumber, item.id, item.name, item.price, item.quantity, item.total]);
      }

      await connection.commit();

      return {
        invoiceNumber,
        customerName,
        customerPhone,
        paymentMethod,
        items,
        subtotal: parseFloat(subtotal),
        tax_amount: parseFloat(taxAmount),
        tip_amount: parseFloat(tipAmount),
        total_amount: parseFloat(total),
        invoice_date: date || new Date().toISOString()
      };
    } catch (error) {
      await connection.rollback();
      throw new Error(`Error creating invoice: ${error.message}`);
    } finally {
      connection.release();
    }
  }

  // Get next invoice number
  static async getNextInvoiceNumber() {
    try {
      const [rows] = await pool.execute(`
        SELECT MAX(CAST(invoice_number AS UNSIGNED)) as maxNumber
        FROM invoices
      `);
      
      const maxNumber = rows[0].maxNumber || 999;
      return (maxNumber + 1).toString();
    } catch (error) {
      throw new Error(`Error getting next invoice number: ${error.message}`);
    }
  }

  // Get invoice statistics
  static async getStatistics() {
    try {
      // Check which columns exist
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'invoices'
      `);
      
      const existingColumns = columns.map(col => col.COLUMN_NAME);
      const hasTotalAmount = existingColumns.includes('total_amount');
      const hasTotal = existingColumns.includes('total');
      const hasTipAmount = existingColumns.includes('tip_amount');
      const hasTaxAmount = existingColumns.includes('tax_amount');

      // Build revenue query based on available columns
      let revenueColumn = '0';
      if (hasTotalAmount) {
        revenueColumn = 'SUM(total_amount)';
      } else if (hasTotal) {
        revenueColumn = 'SUM(total)';
      }

      const [totalRevenue] = await pool.execute(`
        SELECT ${revenueColumn} as totalRevenue
        FROM invoices
      `);

      const [totalOrders] = await pool.execute(`
        SELECT COUNT(*) as totalOrders
        FROM invoices
      `);

      const [uniqueCustomers] = await pool.execute(`
        SELECT COUNT(DISTINCT customer_name) as uniqueCustomers
        FROM invoices
      `);

      // Build tips query based on available columns
      let tipsColumn = '0';
      if (hasTipAmount) {
        tipsColumn = 'SUM(tip_amount)';
      }

      const [totalTips] = await pool.execute(`
        SELECT ${tipsColumn} as totalTips
        FROM invoices
      `);

      // Build tax query based on available columns
      let taxColumn = '0';
      if (hasTaxAmount) {
        taxColumn = 'SUM(tax_amount)';
      }

      const [totalTax] = await pool.execute(`
        SELECT ${taxColumn} as totalTax
        FROM invoices
      `);

      return {
        totalRevenue: parseFloat(totalRevenue[0].totalRevenue) || 0,
        totalOrders: totalOrders[0].totalOrders || 0,
        uniqueCustomers: uniqueCustomers[0].uniqueCustomers || 0,
        totalTips: parseFloat(totalTips[0].totalTips) || 0,
        totalTax: parseFloat(totalTax[0].totalTax) || 0
      };
    } catch (error) {
      throw new Error(`Error fetching statistics: ${error.message}`);
    }
  }
}

module.exports = Invoice; 