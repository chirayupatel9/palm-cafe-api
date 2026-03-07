import { Application, Request, Response } from 'express';
import Invoice from '../models/invoice';
import Order from '../models/order';
import Customer from '../models/customer';
import Cafe from '../models/cafe';
import TaxSettings from '../models/taxSettings';
import { pool } from '../config/database';
import * as pdfService from '../services/pdfService';
import { getOrderCafeId, requireOrderCafeScope, parseListLimitOffset } from './helpers';
import { auth } from '../middleware/auth';
import logger from '../config/logger';

export default function registerCafe(app: Application): void {
  app.get('/api/invoices', auth, requireOrderCafeScope, async (req: Request, res: Response) => {
    try {
      const cafeId = getOrderCafeId(req);
      const { limit, offset } = parseListLimitOffset(req);
      const listOptions = limit != null ? { limit, offset } : {};
      const invoices = await Invoice.getAll(cafeId, listOptions);
      res.json(invoices);
    } catch (error) {
      logger.error('Error fetching invoices:', error as Error);
      res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  });

  app.post('/api/invoices', auth, async (req: Request, res: Response) => {
    try {
      const {
        customerName,
        customerPhone,
        customerEmail,
        tableNumber,
        paymentMethod,
        items,
        tipAmount,
        pointsRedeemed,
        date,
        splitPayment,
        splitPaymentMethod,
        splitAmount,
        extraCharge,
        extraChargeNote,
        wantInvoice
      } = req.body as {
        customerName?: string;
        customerPhone?: string;
        customerEmail?: string;
        tableNumber?: string;
        paymentMethod?: string;
        items?: { id: number; name: string; price: number; quantity: number }[];
        tipAmount?: number | string;
        pointsRedeemed?: number | string;
        date?: string;
        splitPayment?: boolean;
        splitPaymentMethod?: string;
        splitAmount?: number | string;
        extraCharge?: number | string;
        extraChargeNote?: string;
        wantInvoice?: boolean;
      };

      const generateInvoice = wantInvoice !== false;

      if (!customerName || !items || items.length === 0) {
        res.status(400).json({ error: 'Customer name and items are required' });
        return;
      }

      let cafeId = getOrderCafeId(req);
      if (!cafeId) {
        res.status(400).json({
          error: 'Unable to determine cafe. Please ensure you are logged in and belong to a cafe.'
        });
        return;
      }

      const invoiceNumber = generateInvoice ? await Invoice.getNextInvoiceNumber() : null;

      const subtotal = items.reduce((sum, item) => sum + parseFloat(String(item.price)) * item.quantity, 0);

      const taxCalculation = await TaxSettings.calculateTax(subtotal, cafeId);

      const tipAmountNum = parseFloat(String(tipAmount)) || 0;
      const pointsRedeemedNum = parseInt(String(pointsRedeemed), 10) || 0;
      const pointsDiscount = pointsRedeemedNum * 0.1;
      const extraChargeNum = parseFloat(String(extraCharge)) || 0;
      const total = subtotal + taxCalculation.taxAmount + tipAmountNum - pointsDiscount + extraChargeNum;

      const splitPaymentEnabled = Boolean(splitPayment);
      const splitAmountNum = parseFloat(String(splitAmount)) || 0;
      const splitPaymentMethodStr = splitPaymentMethod || 'upi';

      if (splitPaymentEnabled) {
        if (req.user && req.user.role !== 'admin') {
          res.status(403).json({ error: 'Split payment is only available for administrators' });
          return;
        }
        if (splitAmountNum <= 0) {
          res.status(400).json({ error: 'Split payment amount must be greater than 0' });
          return;
        }
        if (splitAmountNum >= total) {
          res.status(400).json({
            error: 'Split payment amount cannot be greater than or equal to total amount'
          });
          return;
        }
      }

      let customer: { id: number } | null = null;
      if (customerPhone || customerName) {
        customer = await Customer.findByEmailOrPhone(
          customerEmail ?? '',
          customerPhone ?? '',
          cafeId
        ) as { id: number } | null;

        if (!customer && customerPhone) {
          customer = (await Customer.create({
            name: customerName,
            phone: customerPhone ?? '',
            email: customerEmail || null,
            address: null,
            date_of_birth: null,
            notes: 'Auto-created from order',
            cafe_id: cafeId
          })) as { id: number };
        }
      }

      const tableNum = tableNumber != null && tableNumber !== '' ? parseInt(String(tableNumber), 10) : null;
      const orderData = {
        cafe_id: cafeId,
        customer_name: customerName,
        customer_email: customerEmail || null,
        customer_phone: customerPhone || null,
        table_number: Number.isNaN(tableNum) ? null : tableNum,
        items: items.map((item: { id: number; name: string; price: number; quantity: number }) => ({
          menu_item_id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: parseFloat(String(item.price)),
          total: parseFloat(String(item.price)) * item.quantity
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

      if (customer) {
        await pool.execute('UPDATE orders SET customer_id = ? WHERE id = ?', [
          customer.id,
          createdOrder.id
        ]);
        if (pointsRedeemedNum > 0) {
          await Customer.updateLoyaltyData(customer.id, 0, -pointsRedeemedNum);
        }
      }

      if (createdOrder && createdOrder.cafe_id) {
        cafeId = createdOrder.cafe_id;
      } else if (!cafeId && req.user && req.user.cafe_id) {
        cafeId = req.user.cafe_id;
      } else {
        try {
          const defaultCafe = await Cafe.getBySlug('default');
          if (defaultCafe) cafeId = defaultCafe.id;
        } catch {
          // Cafe table might not exist yet
        }
      }

      if (generateInvoice && invoiceNumber) {
        const invoiceData = {
          invoiceNumber,
          order_id: createdOrder.id,
          customerName,
          customerPhone,
          paymentMethod: paymentMethod || 'cash',
          items: items.map((item: { id: number; name: string; price: number; quantity: number }) => ({
            id: item.id,
            name: item.name,
            price: parseFloat(String(item.price)),
            quantity: item.quantity,
            total: parseFloat(String(item.price)) * item.quantity
          })),
          subtotal,
          taxAmount: taxCalculation.taxAmount,
          tipAmount: tipAmountNum,
          total,
          date: date || new Date().toISOString(),
          cafe_id: cafeId
        };
        if (invoiceNumber) await Invoice.create(invoiceData);
      }

      res.json({
        invoiceNumber: generateInvoice ? invoiceNumber : null,
        orderNumber: createdOrder.order_number,
        taxInfo: generateInvoice
          ? {
              taxRate: taxCalculation.taxRate,
              taxName: taxCalculation.taxName,
              taxAmount: taxCalculation.taxAmount
            }
          : undefined
      });
    } catch (error) {
      logger.error('Error creating invoice:', error as Error);
      res.status(500).json({ error: 'Failed to create invoice' });
    }
  });

  app.post('/api/invoices/generate', auth, requireOrderCafeScope, async (req: Request, res: Response) => {
    try {
      const cafeId = getOrderCafeId(req);
      const { order_id } = req.body as { order_id?: number };

      if (!order_id) {
        res.status(400).json({ error: 'order_id is required' });
        return;
      }

      const order = await Order.getById(order_id, cafeId);
      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      const existingInvoice = await Invoice.getByOrderNumber(order.order_number, cafeId);
      if (existingInvoice) {
        res.json({ invoiceNumber: existingInvoice.invoice_number });
        return;
      }

      const invoiceNumber = await Invoice.getNextInvoiceNumber();
      const items = (order.items || []).map((item: { menu_item_id?: number | null; name: string; price: number; quantity: number; total: number }) => ({
        id: item.menu_item_id ?? 0,
        name: item.name,
        price: parseFloat(String(item.price)),
        quantity: item.quantity,
        total: parseFloat(String(item.total))
      }));

      const invoiceData = {
        invoiceNumber,
        order_id: order.id,
        customerName: order.customer_name || 'Walk-in Customer',
        customerPhone: order.customer_phone || null,
        paymentMethod: order.payment_method || 'cash',
        items,
        subtotal: parseFloat(String(order.total_amount)),
        taxAmount: parseFloat(String(order.tax_amount || 0)),
        tipAmount: parseFloat(String(order.tip_amount || 0)),
        total: parseFloat(String(order.final_amount)),
        date: order.created_at || new Date().toISOString(),
        cafe_id: cafeId
      };

      await Invoice.create(invoiceData);
      res.json({ invoiceNumber });
    } catch (error) {
      logger.error('Error generating invoice from order:', error as Error);
      res.status(500).json({ error: 'Failed to generate invoice from order' });
    }
  });

  app.get('/api/invoices/:invoiceNumber/pdf', auth, requireOrderCafeScope, async (req: Request, res: Response) => {
    try {
      const cafeId = getOrderCafeId(req);
      const { invoiceNumber } = req.params;

      const invoice = await Invoice.getByNumber(invoiceNumber, cafeId);
      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      try {
        const pdfPayload = {
          ...invoice,
          invoice_date: invoice.invoice_date ?? new Date(),
          order_number: invoice.order_number ?? undefined,
          customer_phone: invoice.customer_phone ?? undefined,
          payment_method: invoice.payment_method ?? undefined
        };
        const pdfBase64 = await pdfService.generatePDF(pdfPayload);
        res.json({
          success: true,
          pdf: pdfBase64,
          invoiceNumber: invoice.invoice_number
        });
      } catch (error) {
        logger.error('Error generating PDF:', error as Error);
        res.status(500).json({ error: 'Failed to generate PDF' });
      }
    } catch (error) {
      logger.error('Error generating PDF:', error as Error);
      res.status(500).json({ error: 'Failed to generate PDF' });
    }
  });

  app.get('/api/invoices/:invoiceNumber/download', auth, requireOrderCafeScope, async (req: Request, res: Response) => {
    try {
      const cafeId = getOrderCafeId(req);
      const { invoiceNumber } = req.params;

      const invoice = await Invoice.getByNumber(invoiceNumber, cafeId);
      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      try {
        const pdfPayload = {
          ...invoice,
          invoice_date: invoice.invoice_date ?? new Date(),
          order_number: invoice.order_number ?? undefined,
          customer_phone: invoice.customer_phone ?? undefined,
          payment_method: invoice.payment_method ?? undefined
        };
        const pdfBase64 = await pdfService.generatePDF(pdfPayload);
        res.json({ pdf: pdfBase64 });
      } catch (error) {
        logger.error('Error generating PDF:', error as Error);
        res.status(500).json({ error: 'Failed to generate PDF' });
      }
    } catch (error) {
      logger.error('Error downloading invoice:', error as Error);
      res.status(500).json({ error: 'Failed to download invoice' });
    }
  });

  app.get('/api/invoices/order/:orderNumber', auth, requireOrderCafeScope, async (req: Request, res: Response) => {
    try {
      const cafeId = getOrderCafeId(req);
      const { orderNumber } = req.params;

      const invoice = await Invoice.getByOrderNumber(orderNumber, cafeId);
      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found for this order' });
        return;
      }

      res.json(invoice);
    } catch (error) {
      logger.error('Error fetching invoice by order number:', error as Error);
      res.status(500).json({ error: 'Failed to fetch invoice' });
    }
  });

  app.get('/api/statistics', auth, requireOrderCafeScope, async (req: Request, res: Response) => {
    try {
      const cafeId = getOrderCafeId(req);
      const statistics = await Invoice.getStatistics(cafeId);
      res.json(statistics);
    } catch (error) {
      logger.error('Error fetching statistics:', error as Error);
      res.status(500).json({ error: 'Failed to fetch statistics' });
    }
  });

  app.get('/api/reports/daily', async (req: Request, res: Response) => {
    try {
      const days = parseInt(String(req.query.days), 10) || 7;
      const [rows] = await pool.execute(
        `SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(final_amount) as earnings
         FROM orders WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         GROUP BY DATE(created_at) ORDER BY date ASC`,
        [days]
      ) as [unknown[], unknown];

      const rowsArr = (rows as { date: string; orders: number; earnings: string }[]) || [];
      const totalEarnings = rowsArr.reduce((sum, row) => sum + parseFloat(String(row.earnings || 0)), 0);
      const totalOrders = rowsArr.reduce((sum, row) => sum + parseInt(String(row.orders || 0), 10), 0);

      res.json({
        dailyData: rowsArr,
        totalEarnings,
        totalOrders
      });
    } catch (error) {
      logger.error('Error fetching daily reports:', error as Error);
      res.status(500).json({ error: 'Failed to fetch daily reports' });
    }
  });

  app.get('/api/reports/top-items', async (_req: Request, res: Response) => {
    try {
      const [rows] = await pool.execute(
        `SELECT mi.id, mi.name, COALESCE(c.name, 'Uncategorized') as category,
         COUNT(oi.id) as total_orders, SUM(oi.total_price) as total_revenue
         FROM menu_items mi
         LEFT JOIN categories c ON mi.category_id = c.id
         LEFT JOIN order_items oi ON mi.id = oi.menu_item_id
         LEFT JOIN orders o ON oi.order_id = o.id
         WHERE (o.status != 'cancelled' OR o.status IS NULL)
         GROUP BY mi.id, mi.name, c.name HAVING total_orders > 0
         ORDER BY total_orders DESC, total_revenue DESC LIMIT 10`
      ) as [unknown[], unknown];

      res.json({ topItems: rows || [] });
    } catch (error) {
      logger.error('Error fetching top items:', error as Error);
      res.status(500).json({ error: 'Failed to fetch top items' });
    }
  });
}
