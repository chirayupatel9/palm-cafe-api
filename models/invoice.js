const { pool } = require('../config/database');

class Invoice {
  // Get all invoices with items
  static async getAll() {
    try {
      const [invoices] = await pool.execute(`
        SELECT 
          i.invoice_number,
          i.customer_name,
          i.customer_phone,
          i.payment_method,
          i.subtotal,
          i.tax_amount,
          i.tip_amount,
          i.total,
          i.date,
          i.created_at
        FROM invoices i
        ORDER BY i.date DESC
      `);

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
            subtotal: parseFloat(invoice.subtotal),
            tax_amount: parseFloat(invoice.tax_amount),
            tip_amount: parseFloat(invoice.tip_amount),
            total: parseFloat(invoice.total),
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
      const [invoices] = await pool.execute(`
        SELECT 
          i.invoice_number,
          i.customer_name,
          i.customer_phone,
          i.payment_method,
          i.subtotal,
          i.tax_amount,
          i.tip_amount,
          i.total,
          i.date,
          i.created_at
        FROM invoices i
        WHERE i.invoice_number = ?
      `, [invoiceNumber]);

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
        total: parseFloat(invoice.total),
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

  // Create new invoice with items
  static async create(invoiceData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { invoiceNumber, customerName, customerPhone, paymentMethod, items, subtotal, taxAmount, tipAmount, total, date } = invoiceData;

      // Convert ISO datetime to MySQL datetime format
      const mysqlDate = new Date(date).toISOString().slice(0, 19).replace('T', ' ');

      // Insert invoice
      await connection.execute(`
        INSERT INTO invoices (invoice_number, customer_name, customer_phone, payment_method, subtotal, tax_amount, tip_amount, total, date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [invoiceNumber, customerName, customerPhone, paymentMethod, subtotal, taxAmount, tipAmount, total, mysqlDate]);

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
        total: parseFloat(total),
        date
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
      const [totalRevenue] = await pool.execute(`
        SELECT SUM(total) as totalRevenue
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

      const [totalTips] = await pool.execute(`
        SELECT SUM(tip_amount) as totalTips
        FROM invoices
      `);

      const [totalTax] = await pool.execute(`
        SELECT SUM(tax_amount) as totalTax
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