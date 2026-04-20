import { Application, Request, Response } from 'express';
import Invoice from '../models/invoice';
import Order from '../models/order';
import Customer from '../models/customer';
import Cafe from '../models/cafe';
import TaxSettings from '../models/taxSettings';
import Inventory from '../models/inventory';
import { pool } from '../config/database';
import * as pdfService from '../services/pdfService';
import XLSX from 'xlsx';
import {
  getOrderCafeId,
  requireOrderCafeScope,
  parseListLimitOffset,
  getInventoryCafeId,
  requireInventoryCafeScope
} from './helpers';
import { auth } from '../middleware/auth';
import { requireFeature } from '../middleware/subscriptionAuth';
import logger from '../config/logger';

export default function registerCafe(app: Application): void {
  const requireReportsCafeScope = (req: Request, res: Response, next: () => void) => {
    const type = String(req.query.type || '').trim();
    const isInventory = type === 'inventory';

    if (isInventory) {
      const cafeId = getInventoryCafeId(req);
      if (cafeId != null) {
        req.cafeId = cafeId;
        next();
        return;
      }
      if (req.user && req.user.role === 'superadmin') {
        next();
        return;
      }
      res.status(403).json({
        error: 'You must be assigned to a cafe to access inventory.',
        code: 'CAFE_SCOPE_REQUIRED'
      });
      return;
    }

    const cafeId = getOrderCafeId(req);
    if (cafeId != null) {
      req.cafeId = cafeId;
      next();
      return;
    }
    if (req.user && req.user.role === 'superadmin') {
      next();
      return;
    }
    res.status(403).json({
      error: 'You must be assigned to a cafe to access orders.',
      code: 'CAFE_SCOPE_REQUIRED'
    });
  };

  const requireInventoryFeatureIfNeeded = async (req: Request, res: Response, next: () => void) => {
    const type = String(req.query.type || '').trim();
    if (type !== 'inventory') {
      next();
      return;
    }
    await requireFeature('inventory')(req, res, next);
  };

  const attachCafeIdFromOrderScope = (req: Request, _res: Response, next: () => void) => {
    const cafeId = getOrderCafeId(req);
    if (cafeId != null) {
      req.cafeId = cafeId;
    }
    next();
  };

  const attachCafeIdFromInventoryScope = (req: Request, _res: Response, next: () => void) => {
    const cafeId = getInventoryCafeId(req);
    if (cafeId != null) {
      req.cafeId = cafeId;
    }
    next();
  };

  const parseIsoDateOnly = (value: unknown): string | null => {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const addOneDay = (yyyyMmDd: string): string => {
    const [y, m, d] = yyyyMmDd.split('-').map((n) => parseInt(n, 10));
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    dt.setUTCDate(dt.getUTCDate() + 1);
    const year = dt.getUTCFullYear();
    const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dt.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const escapeCsvCell = (value: unknown): string => {
    const s = value == null ? '' : String(value);
    const needsQuotes = /[",\n\r]/.test(s);
    const escaped = s.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };

  const toCsv = (columns: string[], rows: Record<string, unknown>[]): string => {
    const lines: string[] = [];
    lines.push(columns.map(escapeCsvCell).join(','));
    for (const row of rows) {
      lines.push(columns.map((c) => escapeCsvCell(row[c])).join(','));
    }
    return `${lines.join('\n')}\n`;
  };

  const parseDateRangeOr400 = (req: Request, res: Response): { startDate: string; endDate: string } | null => {
    const startDate = parseIsoDateOnly(req.query.startDate);
    const endDate = parseIsoDateOnly(req.query.endDate);
    if (!startDate || !endDate) {
      res.status(400).json({
        error: 'startDate and endDate are required (ISO date or datetime)',
        code: 'DATE_RANGE_REQUIRED'
      });
      return null;
    }
    return { startDate, endDate };
  };

  const buildExportFilename = (type: string, ext: string, startDate?: string, endDate?: string) => {
    const safeType = (type || 'report').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    const range = startDate && endDate ? `_${startDate}_to_${endDate}` : '';
    return `palm-cafe_${safeType}${range}.${ext}`;
  };

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

  app.get(
    '/api/reports/daily',
    auth,
    requireOrderCafeScope,
    attachCafeIdFromOrderScope,
    requireFeature('advanced_reports'),
    async (req: Request, res: Response) => {
    try {
      const cafeId = getOrderCafeId(req);
      if (cafeId == null) {
        res.status(400).json({ error: 'Cafe ID is required', code: 'CAFE_ID_REQUIRED' });
        return;
      }

      const startDate = parseIsoDateOnly(req.query.startDate);
      const endDate = parseIsoDateOnly(req.query.endDate);
      const hasRange = Boolean(startDate && endDate);
      const days = parseInt(String(req.query.days), 10) || 7;

      const query = hasRange
        ? `SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(final_amount) as earnings
           FROM orders
           WHERE cafe_id = ? AND created_at >= ? AND created_at < ?
           GROUP BY DATE(created_at) ORDER BY date ASC`
        : `SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(final_amount) as earnings
           FROM orders
           WHERE cafe_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
           GROUP BY DATE(created_at) ORDER BY date ASC`;

      const params = hasRange
        ? [cafeId, startDate!, addOneDay(endDate!)]
        : [cafeId, days];

      const [rows] = await pool.execute(query, params) as [unknown[], unknown];

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
    }
  );

  app.get(
    '/api/reports/top-items',
    auth,
    requireOrderCafeScope,
    attachCafeIdFromOrderScope,
    requireFeature('advanced_reports'),
    async (req: Request, res: Response) => {
    try {
      const cafeId = getOrderCafeId(req);
      if (cafeId == null) {
        res.status(400).json({ error: 'Cafe ID is required', code: 'CAFE_ID_REQUIRED' });
        return;
      }

      const startDate = parseIsoDateOnly(req.query.startDate);
      const endDate = parseIsoDateOnly(req.query.endDate);
      const hasRange = Boolean(startDate && endDate);
      const limitRaw = parseInt(String(req.query.limit), 10);
      const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 10;

      const whereRange = hasRange ? 'AND o.created_at >= ? AND o.created_at < ?' : '';
      const params: (number | string)[] = [cafeId];
      if (hasRange) {
        params.push(startDate!, addOneDay(endDate!));
      }
      params.push(limit);

      const [rows] = await pool.execute(
        `SELECT mi.id, mi.name, COALESCE(c.name, 'Uncategorized') as category,
         COUNT(oi.id) as total_orders, SUM(oi.total_price) as total_revenue
         FROM menu_items mi
         LEFT JOIN categories c ON mi.category_id = c.id
         LEFT JOIN order_items oi ON mi.id = oi.menu_item_id
         LEFT JOIN orders o ON oi.order_id = o.id
         WHERE o.cafe_id = ? ${whereRange} AND (o.status != 'cancelled' OR o.status IS NULL)
         GROUP BY mi.id, mi.name, c.name HAVING total_orders > 0
         ORDER BY total_orders DESC, total_revenue DESC LIMIT ?`,
        params
      ) as [unknown[], unknown];

      res.json({ topItems: rows || [] });
    } catch (error) {
      logger.error('Error fetching top items:', error as Error);
      res.status(500).json({ error: 'Failed to fetch top items' });
    }
    }
  );

  app.get(
    '/api/reports/orders-detail',
    auth,
    requireOrderCafeScope,
    attachCafeIdFromOrderScope,
    requireFeature('advanced_reports'),
    async (req: Request, res: Response) => {
      try {
        const cafeId = getOrderCafeId(req);
        if (cafeId == null) {
          res.status(400).json({ error: 'Cafe ID is required', code: 'CAFE_ID_REQUIRED' });
          return;
        }

        const startDate = parseIsoDateOnly(req.query.startDate);
        const endDate = parseIsoDateOnly(req.query.endDate);
        if (!startDate || !endDate) {
          res.status(400).json({
            error: 'startDate and endDate are required (ISO date or datetime)',
            code: 'DATE_RANGE_REQUIRED'
          });
          return;
        }

        const statusRaw = String(req.query.status || '').trim();
        const paymentRaw = String(req.query.paymentMethod || '').trim();
        const statuses = statusRaw ? statusRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
        const paymentMethods = paymentRaw ? paymentRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

        const where: string[] = [
          'o.cafe_id = ?',
          'o.created_at >= ?',
          'o.created_at < ?'
        ];
        const params: (number | string)[] = [cafeId, startDate, addOneDay(endDate)];

        if (statuses.length) {
          where.push(`o.status IN (${statuses.map(() => '?').join(', ')})`);
          params.push(...statuses);
        }
        if (paymentMethods.length) {
          where.push(`o.payment_method IN (${paymentMethods.map(() => '?').join(', ')})`);
          params.push(...paymentMethods);
        }

        const [rows] = await pool.execute(
          `SELECT
            o.id as order_id,
            o.order_number,
            o.customer_name,
            o.customer_phone,
            o.status,
            o.payment_method,
            o.total_amount,
            o.tax_amount,
            o.tip_amount,
            o.final_amount,
            o.created_at,
            oi.id as order_item_id,
            oi.menu_item_id,
            COALESCE(mi.name, oi.item_name) as item_name,
            oi.quantity as item_quantity,
            oi.unit_price as item_unit_price,
            oi.total_price as item_total_price
          FROM orders o
          LEFT JOIN order_items oi ON o.id = oi.order_id
          LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
          WHERE ${where.join(' AND ')}
          ORDER BY o.created_at DESC, o.id DESC, oi.id ASC`,
          params
        ) as [unknown[], unknown];

        res.json({ rows: rows || [] });
      } catch (error) {
        logger.error('Error fetching orders detail report:', error as Error);
        res.status(500).json({ error: 'Failed to fetch orders detail report' });
      }
    }
  );

  app.get(
    '/api/reports/inventory',
    auth,
    requireInventoryCafeScope,
    attachCafeIdFromInventoryScope,
    requireFeature('advanced_reports'),
    requireFeature('inventory'),
    async (req: Request, res: Response) => {
      try {
        const cafeId = getInventoryCafeId(req);
        if (cafeId == null) {
          res.status(400).json({ error: 'Cafe ID is required', code: 'CAFE_ID_REQUIRED' });
          return;
        }

        const [items, lowStockItems] = await Promise.all([
          Inventory.getAll(cafeId),
          Inventory.getLowStockItems(cafeId)
        ]);

        const lowStockIds = new Set((lowStockItems || []).map((i) => i.id));
        const outOfStockCount = (items || []).reduce((sum, i) => sum + (Number(i.quantity) <= 0 ? 1 : 0), 0);

        const rows = (items || []).map((item) => ({
          ...item,
          low_stock: lowStockIds.has(item.id)
        }));

        res.json({
          rows,
          lowStockCount: lowStockIds.size,
          outOfStockCount
        });
      } catch (error) {
        logger.error('Error fetching inventory report:', error as Error);
        res.status(500).json({ error: 'Failed to fetch inventory report' });
      }
    }
  );

  app.get(
    '/api/reports/export/csv',
    auth,
    requireReportsCafeScope,
    requireFeature('advanced_reports'),
    requireInventoryFeatureIfNeeded,
    async (req: Request, res: Response) => {
      try {
        const type = String(req.query.type || '').trim();
        const cafeId = req.cafeId ?? null;
        if (!cafeId) {
          res.status(400).json({ error: 'Cafe ID is required', code: 'CAFE_ID_REQUIRED' });
          return;
        }

        const range = type === 'inventory' ? null : parseDateRangeOr400(req, res);
        if (type !== 'inventory' && !range) return;

        let columns: string[] = [];
        let rows: Record<string, unknown>[] = [];

        if (type === 'sales_summary') {
          const { startDate, endDate } = range!;
          const [result] = await pool.execute(
            `SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(final_amount) as earnings
             FROM orders
             WHERE cafe_id = ? AND created_at >= ? AND created_at < ?
             GROUP BY DATE(created_at) ORDER BY date ASC`,
            [cafeId, startDate, addOneDay(endDate)]
          ) as [unknown[], unknown];

          columns = ['date', 'orders', 'earnings'];
          rows = (result as Record<string, unknown>[]) || [];
        } else if (type === 'top_items') {
          const { startDate, endDate } = range!;
          const limitRaw = parseInt(String(req.query.limit), 10);
          const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 10;
          const [result] = await pool.execute(
            `SELECT mi.id, mi.name, COALESCE(c.name, 'Uncategorized') as category,
             COUNT(oi.id) as total_orders, SUM(oi.total_price) as total_revenue
             FROM menu_items mi
             LEFT JOIN categories c ON mi.category_id = c.id
             LEFT JOIN order_items oi ON mi.id = oi.menu_item_id
             LEFT JOIN orders o ON oi.order_id = o.id
             WHERE o.cafe_id = ? AND o.created_at >= ? AND o.created_at < ? AND (o.status != 'cancelled' OR o.status IS NULL)
             GROUP BY mi.id, mi.name, c.name HAVING total_orders > 0
             ORDER BY total_orders DESC, total_revenue DESC LIMIT ?`,
            [cafeId, startDate, addOneDay(endDate), limit]
          ) as [unknown[], unknown];

          columns = ['id', 'name', 'category', 'total_orders', 'total_revenue'];
          rows = (result as Record<string, unknown>[]) || [];
        } else if (type === 'orders_detail') {
          const { startDate, endDate } = range!;
          const statusRaw = String(req.query.status || '').trim();
          const paymentRaw = String(req.query.paymentMethod || '').trim();
          const statuses = statusRaw ? statusRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
          const paymentMethods = paymentRaw ? paymentRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

          const where: string[] = [
            'o.cafe_id = ?',
            'o.created_at >= ?',
            'o.created_at < ?'
          ];
          const params: (number | string)[] = [cafeId, startDate, addOneDay(endDate)];

          if (statuses.length) {
            where.push(`o.status IN (${statuses.map(() => '?').join(', ')})`);
            params.push(...statuses);
          }
          if (paymentMethods.length) {
            where.push(`o.payment_method IN (${paymentMethods.map(() => '?').join(', ')})`);
            params.push(...paymentMethods);
          }

          const [result] = await pool.execute(
            `SELECT
              o.order_number,
              o.customer_name,
              o.customer_phone,
              o.status,
              o.payment_method,
              o.total_amount,
              o.tax_amount,
              o.tip_amount,
              o.final_amount,
              o.created_at,
              COALESCE(mi.name, oi.item_name) as item_name,
              oi.quantity as item_quantity,
              oi.unit_price as item_unit_price,
              oi.total_price as item_total_price
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
            WHERE ${where.join(' AND ')}
            ORDER BY o.created_at DESC, o.id DESC, oi.id ASC`,
            params
          ) as [unknown[], unknown];

          columns = [
            'order_number',
            'created_at',
            'status',
            'payment_method',
            'customer_name',
            'customer_phone',
            'total_amount',
            'tax_amount',
            'tip_amount',
            'final_amount',
            'item_name',
            'item_quantity',
            'item_unit_price',
            'item_total_price'
          ];
          rows = (result as Record<string, unknown>[]) || [];
        } else if (type === 'inventory') {
          const [items, lowStockItems] = await Promise.all([
            Inventory.getAll(cafeId),
            Inventory.getLowStockItems(cafeId)
          ]);
          const lowStockIds = new Set((lowStockItems || []).map((i) => i.id));
          columns = [
            'id',
            'name',
            'category',
            'quantity',
            'unit',
            'cost_per_unit',
            'supplier',
            'reorder_level',
            'description',
            'low_stock'
          ];
          rows = (items || []).map((i) => ({
            ...i,
            low_stock: lowStockIds.has(i.id)
          })) as unknown as Record<string, unknown>[];
        } else {
          res.status(400).json({ error: 'Invalid report type', code: 'INVALID_REPORT_TYPE' });
          return;
        }

        const filename =
          type === 'inventory'
            ? buildExportFilename(type, 'csv')
            : buildExportFilename(type, 'csv', range!.startDate, range!.endDate);

        const csv = toCsv(columns, rows);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
      } catch (error) {
        logger.error('Error exporting report CSV:', error as Error);
        res.status(500).json({ error: 'Failed to export report CSV' });
      }
    }
  );

  app.get(
    '/api/reports/export/xlsx',
    auth,
    requireReportsCafeScope,
    requireFeature('advanced_reports'),
    requireInventoryFeatureIfNeeded,
    async (req: Request, res: Response) => {
      try {
        const type = String(req.query.type || '').trim();
        const cafeId = req.cafeId ?? null;
        if (!cafeId) {
          res.status(400).json({ error: 'Cafe ID is required', code: 'CAFE_ID_REQUIRED' });
          return;
        }

        const range = type === 'inventory' ? null : parseDateRangeOr400(req, res);
        if (type !== 'inventory' && !range) return;

        let sheetName = 'Report';
        let rows: Record<string, unknown>[] = [];

        if (type === 'sales_summary') {
          const { startDate, endDate } = range!;
          const [result] = await pool.execute(
            `SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(final_amount) as earnings
             FROM orders
             WHERE cafe_id = ? AND created_at >= ? AND created_at < ?
             GROUP BY DATE(created_at) ORDER BY date ASC`,
            [cafeId, startDate, addOneDay(endDate)]
          ) as [unknown[], unknown];
          sheetName = 'Sales Summary';
          rows = (result as Record<string, unknown>[]) || [];
        } else if (type === 'top_items') {
          const { startDate, endDate } = range!;
          const limitRaw = parseInt(String(req.query.limit), 10);
          const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 10;
          const [result] = await pool.execute(
            `SELECT mi.id, mi.name, COALESCE(c.name, 'Uncategorized') as category,
             COUNT(oi.id) as total_orders, SUM(oi.total_price) as total_revenue
             FROM menu_items mi
             LEFT JOIN categories c ON mi.category_id = c.id
             LEFT JOIN order_items oi ON mi.id = oi.menu_item_id
             LEFT JOIN orders o ON oi.order_id = o.id
             WHERE o.cafe_id = ? AND o.created_at >= ? AND o.created_at < ? AND (o.status != 'cancelled' OR o.status IS NULL)
             GROUP BY mi.id, mi.name, c.name HAVING total_orders > 0
             ORDER BY total_orders DESC, total_revenue DESC LIMIT ?`,
            [cafeId, startDate, addOneDay(endDate), limit]
          ) as [unknown[], unknown];
          sheetName = 'Top Items';
          rows = (result as Record<string, unknown>[]) || [];
        } else if (type === 'orders_detail') {
          const { startDate, endDate } = range!;
          const statusRaw = String(req.query.status || '').trim();
          const paymentRaw = String(req.query.paymentMethod || '').trim();
          const statuses = statusRaw ? statusRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
          const paymentMethods = paymentRaw ? paymentRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

          const where: string[] = [
            'o.cafe_id = ?',
            'o.created_at >= ?',
            'o.created_at < ?'
          ];
          const params: (number | string)[] = [cafeId, startDate, addOneDay(endDate)];

          if (statuses.length) {
            where.push(`o.status IN (${statuses.map(() => '?').join(', ')})`);
            params.push(...statuses);
          }
          if (paymentMethods.length) {
            where.push(`o.payment_method IN (${paymentMethods.map(() => '?').join(', ')})`);
            params.push(...paymentMethods);
          }

          const [result] = await pool.execute(
            `SELECT
              o.order_number,
              o.created_at,
              o.status,
              o.payment_method,
              o.customer_name,
              o.customer_phone,
              o.total_amount,
              o.tax_amount,
              o.tip_amount,
              o.final_amount,
              COALESCE(mi.name, oi.item_name) as item_name,
              oi.quantity as item_quantity,
              oi.unit_price as item_unit_price,
              oi.total_price as item_total_price
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
            WHERE ${where.join(' AND ')}
            ORDER BY o.created_at DESC, o.id DESC, oi.id ASC`,
            params
          ) as [unknown[], unknown];
          sheetName = 'Orders Detail';
          rows = (result as Record<string, unknown>[]) || [];
        } else if (type === 'inventory') {
          const [items, lowStockItems] = await Promise.all([
            Inventory.getAll(cafeId),
            Inventory.getLowStockItems(cafeId)
          ]);
          const lowStockIds = new Set((lowStockItems || []).map((i) => i.id));
          sheetName = 'Inventory';
          rows = (items || []).map((i) => ({
            ...i,
            low_stock: lowStockIds.has(i.id)
          })) as unknown as Record<string, unknown>[];
        } else {
          res.status(400).json({ error: 'Invalid report type', code: 'INVALID_REPORT_TYPE' });
          return;
        }

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        const filename =
          type === 'inventory'
            ? buildExportFilename(type, 'xlsx')
            : buildExportFilename(type, 'xlsx', range!.startDate, range!.endDate);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
      } catch (error) {
        logger.error('Error exporting report XLSX:', error as Error);
        res.status(500).json({ error: 'Failed to export report XLSX' });
      }
    }
  );

  app.get(
    '/api/reports/export/pdf',
    auth,
    requireReportsCafeScope,
    requireFeature('advanced_reports'),
    requireInventoryFeatureIfNeeded,
    async (req: Request, res: Response) => {
      try {
        const type = String(req.query.type || '').trim();
        const cafeId = req.cafeId ?? null;
        if (!cafeId) {
          res.status(400).json({ error: 'Cafe ID is required', code: 'CAFE_ID_REQUIRED' });
          return;
        }

        const range = type === 'inventory' ? null : parseDateRangeOr400(req, res);
        if (type !== 'inventory' && !range) return;

        let title = 'Report';
        let columns: string[] = [];
        let rows: Record<string, unknown>[] = [];

        if (type === 'sales_summary') {
          const { startDate, endDate } = range!;
          const [result] = await pool.execute(
            `SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(final_amount) as earnings
             FROM orders
             WHERE cafe_id = ? AND created_at >= ? AND created_at < ?
             GROUP BY DATE(created_at) ORDER BY date ASC`,
            [cafeId, startDate, addOneDay(endDate)]
          ) as [unknown[], unknown];
          title = `Sales Summary (${startDate} to ${endDate})`;
          columns = ['date', 'orders', 'earnings'];
          rows = (result as Record<string, unknown>[]) || [];
        } else if (type === 'top_items') {
          const { startDate, endDate } = range!;
          const limitRaw = parseInt(String(req.query.limit), 10);
          const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 10;
          const [result] = await pool.execute(
            `SELECT mi.name, COALESCE(c.name, 'Uncategorized') as category,
             COUNT(oi.id) as total_orders, SUM(oi.total_price) as total_revenue
             FROM menu_items mi
             LEFT JOIN categories c ON mi.category_id = c.id
             LEFT JOIN order_items oi ON mi.id = oi.menu_item_id
             LEFT JOIN orders o ON oi.order_id = o.id
             WHERE o.cafe_id = ? AND o.created_at >= ? AND o.created_at < ? AND (o.status != 'cancelled' OR o.status IS NULL)
             GROUP BY mi.id, mi.name, c.name HAVING total_orders > 0
             ORDER BY total_orders DESC, total_revenue DESC LIMIT ?`,
            [cafeId, startDate, addOneDay(endDate), limit]
          ) as [unknown[], unknown];
          title = `Top Items (${startDate} to ${endDate})`;
          columns = ['name', 'category', 'total_orders', 'total_revenue'];
          rows = (result as Record<string, unknown>[]) || [];
        } else if (type === 'orders_detail') {
          const { startDate, endDate } = range!;
          const [result] = await pool.execute(
            `SELECT
              o.order_number,
              o.created_at,
              o.status,
              o.payment_method,
              o.customer_name,
              o.final_amount
            FROM orders o
            WHERE o.cafe_id = ? AND o.created_at >= ? AND o.created_at < ?
            ORDER BY o.created_at DESC, o.id DESC`,
            [cafeId, startDate, addOneDay(endDate)]
          ) as [unknown[], unknown];
          title = `Orders (${startDate} to ${endDate})`;
          columns = ['order_number', 'created_at', 'status', 'payment_method', 'customer_name', 'final_amount'];
          rows = (result as Record<string, unknown>[]) || [];
        } else if (type === 'inventory') {
          const [items, lowStockItems] = await Promise.all([
            Inventory.getAll(cafeId),
            Inventory.getLowStockItems(cafeId)
          ]);
          const lowStockIds = new Set((lowStockItems || []).map((i) => i.id));
          title = 'Inventory';
          columns = ['name', 'category', 'quantity', 'unit', 'reorder_level', 'low_stock'];
          rows = (items || []).map((i) => ({
            name: i.name,
            category: i.category,
            quantity: i.quantity,
            unit: i.unit,
            reorder_level: i.reorder_level,
            low_stock: lowStockIds.has(i.id)
          })) as unknown as Record<string, unknown>[];
        } else {
          res.status(400).json({ error: 'Invalid report type', code: 'INVALID_REPORT_TYPE' });
          return;
        }

        const pdfBase64 = await pdfService.generateReportPdf({
          cafe_id: cafeId,
          title,
          columns,
          rows
        });

        const filename =
          type === 'inventory'
            ? buildExportFilename(type, 'pdf')
            : buildExportFilename(type, 'pdf', range!.startDate, range!.endDate);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(Buffer.from(pdfBase64, 'base64'));
      } catch (error) {
        logger.error('Error exporting report PDF:', error as Error);
        res.status(500).json({ error: 'Failed to export report PDF' });
      }
    }
  );
}
