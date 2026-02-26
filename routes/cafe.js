const Invoice = require('../models/invoice');
const TaxSettings = require('../models/taxSettings');
const { pool } = require('../config/database');
const pdfService = require('../services/pdfService');
const { getOrderCafeId, requireOrderCafeScope, parseListLimitOffset } = require('./helpers');
const { auth } = require('../middleware/auth');
const logger = require('../config/logger');

module.exports = function registerCafe(app) {
// Get all invoices (multi-cafe: scoped by cafe_id)
app.get('/api/invoices', auth, requireOrderCafeScope, async (req, res) => {
  try {
    const cafeId = getOrderCafeId(req);
    const { limit, offset } = parseListLimitOffset(req);
    const listOptions = limit != null ? { limit, offset } : {};
    const invoices = await Invoice.getAll(cafeId, listOptions);
    res.json(invoices);
  } catch (error) {
    logger.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// Create new invoice
app.post('/api/invoices', auth, async (req, res) => {
  try {
    const { customerName, customerPhone, customerEmail, tableNumber, paymentMethod, items, tipAmount, pointsRedeemed, date, splitPayment, splitPaymentMethod, splitAmount, extraCharge, extraChargeNote, wantInvoice } = req.body;

    const generateInvoice = wantInvoice !== false;

    if (!customerName || !items || items.length === 0) {
      return res.status(400).json({ error: 'Customer name and items are required' });
    }

    let cafeId = getOrderCafeId(req);
    if (!cafeId) {
      return res.status(400).json({ error: 'Unable to determine cafe. Please ensure you are logged in and belong to a cafe.' });
    }

    const invoiceNumber = generateInvoice ? await Invoice.getNextInvoiceNumber() : null;

    // Calculate subtotal
    const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0);

    // Calculate tax (cafe-scoped)
    const taxCalculation = await TaxSettings.calculateTax(subtotal, cafeId);
    
    // Calculate total
    const tipAmountNum = parseFloat(tipAmount) || 0;
    const pointsRedeemedNum = parseInt(pointsRedeemed) || 0;
    const pointsDiscount = pointsRedeemedNum * 0.1; // 1 point = 0.1 INR
    const extraChargeNum = parseFloat(extraCharge) || 0;
    const total = subtotal + taxCalculation.taxAmount + tipAmountNum - pointsDiscount + extraChargeNum;

    // Handle split payment validation - only admins can use split payment
    const splitPaymentEnabled = Boolean(splitPayment);
    const splitAmountNum = parseFloat(splitAmount) || 0;
    const splitPaymentMethodStr = splitPaymentMethod || 'upi';
    
    if (splitPaymentEnabled) {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Split payment is only available for administrators' });
      }
      
      if (splitAmountNum <= 0) {
        return res.status(400).json({ error: 'Split payment amount must be greater than 0' });
      }
      if (splitAmountNum >= total) {
        return res.status(400).json({ error: 'Split payment amount cannot be greater than or equal to total amount' });
      }
    }

    // Check if customer exists or create new one (scoped to this cafe)
    let customer = null;
    if (customerPhone || customerName) {
      customer = await Customer.findByEmailOrPhone(customerName, customerPhone, cafeId);
      
      if (!customer && customerPhone) {
        // Create new customer if phone number provided
        customer = await Customer.create({
          name: customerName,
          phone: customerPhone,
          email: customerEmail || null,
          address: null,
          date_of_birth: null,
          notes: 'Auto-created from order',
          cafe_id: cafeId
        });
      }
    }

    // First create an order (include cafe_id for multi-cafe)
    const orderData = {
      cafe_id: cafeId,
      customer_name: customerName,
      customer_email: customerEmail || null,
      customer_phone: customerPhone,
      table_number: tableNumber || null,
      items: items.map(item => ({
        menu_item_id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: parseFloat(item.price),
        total: parseFloat(item.price) * item.quantity
      })),
      total_amount: subtotal,
      tax_amount: taxCalculation.taxAmount,
      tip_amount: tipAmountNum,
      points_redeemed: pointsRedeemedNum,
      final_amount: total,
      payment_method: paymentMethod || 'cash',
      split_payment: splitPaymentEnabled,
      split_payment_method: splitPaymentMethodStr,
      split_amount: splitAmountNum,
      extra_charge: extraChargeNum,
      extra_charge_note: extraChargeNote || null,
      notes: ''
    };

    const createdOrder = await Order.create(orderData);

    // Update order with customer_id if customer exists
    if (customer) {
      await pool.execute('UPDATE orders SET customer_id = ? WHERE id = ?', [customer.id, createdOrder.id]);
      
      // Only deduct redeemed points immediately (points earned will be added when order is completed)
      if (pointsRedeemedNum > 0) {
        await Customer.updateLoyaltyData(customer.id, 0, -pointsRedeemedNum);
      }
    }

    // cafeId is already set above from authenticated user
    // If order has cafe_id, use that instead (should match, but just in case)
    if (createdOrder && createdOrder.cafe_id) {
      cafeId = createdOrder.cafe_id;
    } else if (!cafeId && req.user && req.user.cafe_id) {
      cafeId = req.user.cafe_id;
    } else {
      // Try to get default cafe
      try {
        const defaultCafe = await Cafe.getBySlug('default');
        if (defaultCafe) {
          cafeId = defaultCafe.id;
        }
      } catch (error) {
        // Cafe table might not exist yet, ignore
      }
    }

    if (generateInvoice) {
      const invoiceData = {
        invoiceNumber,
        order_id: createdOrder.id,
        customerName,
        customerPhone,
        paymentMethod: paymentMethod || 'cash',
        splitPayment: splitPaymentEnabled,
        splitPaymentMethod: splitPaymentMethodStr,
        splitAmount: splitAmountNum,
        items,
        subtotal,
        taxAmount: taxCalculation.taxAmount,
        tipAmount: tipAmountNum,
        total,
        date: date || new Date().toISOString(),
        cafe_id: cafeId
      };
      await Invoice.create(invoiceData);
    }

    res.json({
      invoiceNumber: generateInvoice ? invoiceNumber : null,
      orderNumber: createdOrder.order_number,
      taxInfo: generateInvoice ? {
        taxRate: taxCalculation.taxRate,
        taxName: taxCalculation.taxName,
        taxAmount: taxCalculation.taxAmount
      } : undefined
    });
  } catch (error) {
    logger.error('Error creating invoice:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// Generate PDF for invoice
app.get('/api/invoices/:invoiceNumber/pdf', auth, requireOrderCafeScope, async (req, res) => {
  try {
    const cafeId = getOrderCafeId(req);
    const { invoiceNumber } = req.params;
    
    const invoice = await Invoice.getByNumber(invoiceNumber, cafeId);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    try {
      const pdfBase64 = await pdfService.generatePDF(invoice);
      res.json({ 
        success: true,
        pdf: pdfBase64,
        invoiceNumber: invoice.invoice_number
      });
    } catch (error) {
      logger.error('Error generating PDF:', error);
      res.status(500).json({ error: 'Failed to generate PDF' });
    }
  } catch (error) {
    logger.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Download invoice (legacy endpoint)
app.get('/api/invoices/:invoiceNumber/download', auth, requireOrderCafeScope, async (req, res) => {
  try {
    const cafeId = getOrderCafeId(req);
    const { invoiceNumber } = req.params;
    
    const invoice = await Invoice.getByNumber(invoiceNumber, cafeId);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    try {
      const pdfBase64 = await pdfService.generatePDF(invoice);
      res.json({ pdf: pdfBase64 });
    } catch (error) {
      logger.error('Error generating PDF:', error);
      res.status(500).json({ error: 'Failed to generate PDF' });
    }
  } catch (error) {
    logger.error('Error downloading invoice:', error);
    res.status(500).json({ error: 'Failed to download invoice' });
  }
});

// Get invoice by order number
app.get('/api/invoices/order/:orderNumber', auth, requireOrderCafeScope, async (req, res) => {
  try {
    const cafeId = getOrderCafeId(req);
    const { orderNumber } = req.params;
    
    const invoice = await Invoice.getByOrderNumber(orderNumber, cafeId);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found for this order' });
    }

    res.json(invoice);
  } catch (error) {
    logger.error('Error fetching invoice by order number:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// Get invoice statistics (multi-cafe: scoped by cafe_id)
app.get('/api/statistics', auth, requireOrderCafeScope, async (req, res) => {
  try {
    const cafeId = getOrderCafeId(req);
    const statistics = await Invoice.getStatistics(cafeId);
    res.json(statistics);
  } catch (error) {
    logger.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get daily reports data
app.get('/api/reports/daily', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const [rows] = await pool.execute(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as orders,
        SUM(final_amount) as earnings
      FROM orders 
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [days]);

    // Calculate totals
    const totalEarnings = rows.reduce((sum, row) => sum + parseFloat(row.earnings || 0), 0);
    const totalOrders = rows.reduce((sum, row) => sum + parseInt(row.orders || 0), 0);

    res.json({
      dailyData: rows,
      totalEarnings,
      totalOrders
    });
  } catch (error) {
    logger.error('Error fetching daily reports:', error);
    res.status(500).json({ error: 'Failed to fetch daily reports' });
  }
});

// Get top ordered items
app.get('/api/reports/top-items', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        mi.id,
        mi.name,
        COALESCE(c.name, 'Uncategorized') as category,
        COUNT(oi.id) as total_orders,
        SUM(oi.total_price) as total_revenue
      FROM menu_items mi
      LEFT JOIN categories c ON mi.category_id = c.id
      LEFT JOIN order_items oi ON mi.id = oi.menu_item_id
      LEFT JOIN orders o ON oi.order_id = o.id
      WHERE (o.status != 'cancelled' OR o.status IS NULL)
      GROUP BY mi.id, mi.name, c.name
      HAVING total_orders > 0
      ORDER BY total_orders DESC, total_revenue DESC
      LIMIT 10
    `);

    res.json({
      topItems: rows
    });
  } catch (error) {
    logger.error('Error fetching top items:', error);
    res.status(500).json({ error: 'Failed to fetch top items' });
  }
});
};
