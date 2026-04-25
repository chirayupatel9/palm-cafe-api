import { Application, Request, Response } from 'express';
import Order, { OrderRow } from '../models/order';
import Customer from '../models/customer';
import CafeSettings from '../models/cafeSettings';
import Cafe from '../models/cafe';
import MenuItem from '../models/menuItem';
import TaxSettings from '../models/taxSettings';
import { pool } from '../config/database';
import {
  getOrderCafeId,
  requireOrderCafeScope,
  parseListLimitOffset,
  isInvalidCustomerPhone
} from './helpers';
import { auth, adminAuth, chefAuth } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/subscriptionAuth';
import * as subscriptionService from '../services/subscriptionService';
import {
  isMalformedString,
  validateRequiredString,
  sanitizeString
} from '../middleware/validateInput';
import logger from '../config/logger';

const getWsManager = (): { broadcastOrderStatusUpdate: (o: unknown) => void; broadcastNewOrder: (o: unknown) => void } | undefined =>
  (typeof global !== 'undefined' && (global as { wsManager?: unknown }).wsManager) as { broadcastOrderStatusUpdate: (o: unknown) => void; broadcastNewOrder: (o: unknown) => void } | undefined;

function moneyAmount(n: number | string | null | undefined): string {
  return (Number(n) || 0).toFixed(2);
}

/**
 * Plain-text receipt for thermal printers (narrow monospace layout).
 */
function formatThermalOrderText(order: OrderRow, cafeName: string): string {
  const width = 42;
  const divider = '-'.repeat(width);
  const centerLine = (s: string) => {
    const t = String(s || '').trim();
    if (t.length >= width) return t.slice(0, width);
    const pad = width - t.length;
    const left = Math.floor(pad / 2);
    return ' '.repeat(left) + t + ' '.repeat(pad - left);
  };
  const row = (left: string, right: string) => {
    const r = String(right);
    const maxLeft = Math.max(0, width - r.length - 1);
    let l = String(left || '');
    if (l.length > maxLeft) l = l.slice(0, Math.max(0, maxLeft - 2)) + '..';
    const spaces = width - l.length - r.length;
    return l + (spaces > 0 ? ' '.repeat(spaces) : ' ') + r;
  };

  const lines: string[] = [];
  lines.push(centerLine(cafeName || 'Cafe'));
  lines.push(centerLine(`Order ${order.order_number || ''}`));
  lines.push(divider);
  lines.push(row('Status', String(order.status || '')));
  if (order.customer_name) lines.push(row('Customer', String(order.customer_name).slice(0, 22)));
  if (order.table_number != null && order.table_number !== undefined) {
    lines.push(row('Table', String(order.table_number)));
  }
  lines.push(divider);
  for (const item of order.items || []) {
    const qty = `${item.quantity}x`;
    const name = String(item.name || 'Item');
    const lineTotal =
      item.total != null
        ? Number(item.total)
        : (Number(item.price) || 0) * (Number(item.quantity) || 0);
    lines.push(row(`${qty} ${name}`, moneyAmount(lineTotal)));
  }
  lines.push(divider);
  lines.push(row('Subtotal', moneyAmount(order.total_amount)));
  lines.push(row('Tax', moneyAmount(order.tax_amount)));
  if (Number(order.tip_amount) > 0) lines.push(row('Tip', moneyAmount(order.tip_amount)));
  if (order.points_redeemed > 0) {
    const disc = (order.points_redeemed * 0.1).toFixed(2);
    lines.push(row(`Points (${order.points_redeemed})`, `-${disc}`));
  }
  if (Number(order.extra_charge) > 0) lines.push(row('Extra', moneyAmount(order.extra_charge)));
  lines.push(divider);
  lines.push(row('TOTAL', moneyAmount(order.final_amount)));
  lines.push(divider);
  if (order.payment_method) lines.push(row('Payment', String(order.payment_method)));
  if (order.split_payment) {
    lines.push(row('Split', String(order.split_payment_method || '')));
    lines.push(row('Split amt', moneyAmount(order.split_amount)));
  }
  if (order.notes) lines.push(row('Notes', String(order.notes).slice(0, Math.max(0, width - 7))));
  lines.push(divider);
  lines.push(centerLine('Thank you'));

  return `${lines.join('\n')}\n`;
}

/**
 * Subscription must match the cafe that owns the order (supports superadmin without user.cafe_id).
 */
async function assertSubscriptionForOrderPrint(cafeId: number | null, res: Response): Promise<boolean> {
  if (cafeId == null || !Number.isFinite(Number(cafeId)) || Number(cafeId) <= 0) {
    res.status(400).json({
      error: 'Cafe ID is required',
      code: 'CAFE_ID_REQUIRED'
    });
    return false;
  }
  const idNum = Number(cafeId);
  const subscription = await subscriptionService.getCafeSubscription(idNum);
  if (!subscription) {
    res.status(404).json({
      error: 'Cafe not found',
      code: 'CAFE_NOT_FOUND'
    });
    return false;
  }
  if (subscription.status !== subscriptionService.STATUSES.ACTIVE) {
    res.status(403).json({
      error: `Subscription is ${subscription.status}. Please activate your subscription to access this feature.`,
      code: 'SUBSCRIPTION_INACTIVE',
      subscription_status: subscription.status
    });
    return false;
  }
  return true;
}

async function orderPrintHandler(req: Request, res: Response): Promise<void> {
  try {
    const cafeId = getOrderCafeId(req);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid order id' });
      return;
    }

    const order = await Order.getById(id, cafeId);
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const orderCafeIdRaw = (order as OrderRow & { cafe_id?: number | null }).cafe_id;
    const subCafeId =
      orderCafeIdRaw != null && orderCafeIdRaw !== undefined && Number(orderCafeIdRaw) > 0
        ? Number(orderCafeIdRaw)
        : cafeId;

    if (!(await assertSubscriptionForOrderPrint(subCafeId, res))) {
      return;
    }

    const settings = await CafeSettings.getCurrent(subCafeId);
    const cafeName = (settings?.cafe_name as string) || 'Cafe';
    const body = formatThermalOrderText(order, cafeName);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(body);
  } catch (error) {
    logger.error('Error building order print text:', error as Error);
    res.status(500).json({ error: 'Failed to build print content' });
  }
}

export default function registerOrders(app: Application): void {
  app.get(
    '/api/orders',
    auth,
    requireActiveSubscription,
    requireOrderCafeScope,
    async (req: Request, res: Response) => {
      try {
        const cafeId = getOrderCafeId(req);
        const { customer_phone, order_number } = req.query as {
          customer_phone?: string;
          order_number?: string;
        };
        const { limit, offset } = parseListLimitOffset(req);
        const listOptions = limit != null ? { limit, offset } : {};

        let orders;
        if (customer_phone && !isInvalidCustomerPhone(customer_phone)) {
          orders = await Order.getByCustomerPhone(customer_phone, cafeId);
        } else if (order_number && !isMalformedString(order_number)) {
          orders = await Order.getByOrderNumber(order_number, cafeId);
        } else {
          orders = await Order.getAll(cafeId, listOptions);
        }

        res.json(orders);
      } catch (error) {
        logger.error('Error fetching orders:', error as Error);
        res.status(500).json({ error: 'Failed to fetch orders' });
      }
    }
  );

  app.get('/api/customer/orders', async (req: Request, res: Response) => {
    try {
      const { customer_phone, cafeSlug } = req.query as { customer_phone?: string; cafeSlug?: string };

      if (isInvalidCustomerPhone(customer_phone)) {
        res.status(400).json({ error: 'Customer phone number is required' });
        return;
      }

      let cafeId: number | null = null;
      if (cafeSlug && !isMalformedString(cafeSlug)) {
        const cafe = await Cafe.getBySlug(cafeSlug);
        if (cafe) cafeId = cafe.id;
      }
      const orders = await Order.getByCustomerPhone(customer_phone!, cafeId);
      res.json(orders);
    } catch (error) {
      logger.error('Error fetching customer orders:', error as Error);
      res.status(500).json({ error: 'Failed to fetch customer orders' });
    }
  });

  app.post('/api/customer/orders', async (req: Request, res: Response) => {
    try {
      let {
        customerName,
        customerPhone,
        customerEmail,
        tableNumber,
        paymentMethod,
        items,
        tipAmount,
        pointsRedeemed,
        date,
        pickupOption
      } = req.body as {
        customerName?: string;
        customerPhone?: string;
        customerEmail?: string;
        tableNumber?: string;
        paymentMethod?: string;
        items?: { id?: number; menu_item_id?: number; name?: string; price?: number; quantity?: number }[];
        tipAmount?: number | string;
        pointsRedeemed?: number | string;
        date?: string;
        pickupOption?: string;
      };

      const nameErr = validateRequiredString(customerName, 'Customer name');
      if (nameErr) {
        res.status(400).json({ error: nameErr });
        return;
      }
      if (!items || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: 'At least one order item is required' });
        return;
      }
      const hasInvalidItem = items.some((item) => item.id == null && item.menu_item_id == null);
      if (hasInvalidItem) {
        res.status(400).json({ error: 'Each order item must have an id' });
        return;
      }

      if (isInvalidCustomerPhone(customerPhone)) {
        customerPhone = undefined;
      }

      const subtotal = items.reduce(
        (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
        0
      );
      if (Number.isNaN(subtotal) || subtotal < 0) {
        res.status(400).json({ error: 'Invalid item prices or quantities' });
        return;
      }
      const cafeSlug = (req.query.cafeSlug as string) || (req.body.cafeSlug as string) || 'default';

      let cafe = await Cafe.getBySlug(cafeSlug);
      if (!cafe) {
        cafe = await Cafe.getFirstActive();
      }
      const cafeIdForTax = cafe ? cafe.id : null;
      const taxCalculation = await TaxSettings.calculateTax(subtotal, cafeIdForTax);

      const cafeId = cafe ? cafe.id : null;
      if (!cafeId) {
        res.status(400).json({
          error: 'Unable to determine cafe. Please provide a valid cafe slug.'
        });
        return;
      }

      const tipAmountNum = parseFloat(String(tipAmount)) || 0;
      const pointsRedeemedNum = parseInt(String(pointsRedeemed), 10) || 0;
      const pointsDiscount = pointsRedeemedNum * 0.1;
      const total = subtotal + taxCalculation.taxAmount + tipAmountNum - pointsDiscount;

      let customer: { id: number } | null = null;
      if (customerPhone || customerName) {
        customer = (await Customer.findByEmailOrPhone(
          customerEmail ?? '',
          customerPhone ?? '',
          cafeId
        )) as { id: number } | null;

        if (!customer && customerPhone) {
          customer = (await Customer.create({
            name: customerName!,
            phone: String(customerPhone),
            email: customerEmail || null,
            address: null,
            date_of_birth: null,
            notes: 'Auto-created from customer order',
            cafe_id: cafeId
          })) as { id: number };
        }
      }

      const orderData = {
        cafe_id: cafeId,
        customer_name: sanitizeString(customerName) ?? '',
        customer_email: sanitizeString(customerEmail),
        customer_phone: customerPhone ?? undefined,
        table_number: tableNumber != null && tableNumber !== '' ? parseInt(String(tableNumber), 10) || null : null,
        items: items.map((item) => ({
          menu_item_id: item.id != null ? item.id : item.menu_item_id!,
          name: item.name || 'Item',
          quantity: Number(item.quantity) || 1,
          price: Number(item.price) || 0,
          total: (Number(item.price) || 0) * (Number(item.quantity) || 1)
        })),
        total_amount: subtotal,
        tax_amount: taxCalculation.taxAmount,
        tip_amount: tipAmountNum,
        points_redeemed: pointsRedeemedNum,
        final_amount: total,
        payment_method: paymentMethod || 'cash',
        split_payment: false,
        split_payment_method: null,
        split_amount: 0,
        extra_charge: 0,
        extra_charge_note: null,
        notes: pickupOption === 'delivery' ? 'Delivery order' : 'Pickup order'
      };

      const createdOrder = await Order.create(orderData);

      if (customer) {
        await pool.execute('UPDATE orders SET customer_id = ? WHERE id = ?', [
          customer.id,
          createdOrder.id
        ] as (number | string)[]);
        if (pointsRedeemedNum > 0) {
          await Customer.updateLoyaltyData(customer.id, 0, -pointsRedeemedNum);
        }
      }

      res.status(201).json({
        orderNumber: createdOrder.order_number,
        orderId: createdOrder.id,
        customerName,
        customerPhone,
        items,
        subtotal,
        taxAmount: taxCalculation.taxAmount,
        tipAmount: tipAmountNum,
        total,
        status: 'pending'
      });
    } catch (error) {
      logger.error('Error creating customer order:', { message: (error as Error).message });
      const isProd = process.env.NODE_ENV === 'production';
      const errorMessage =
        error && (error as Error).message ? String((error as Error).message) : 'Failed to create order';
      res.status(500).json({
        error: isProd ? 'Failed to create order' : errorMessage,
        code: 'ORDER_CREATE_FAILED'
      });
    }
  });

  app.patch(
    '/api/orders/:id/status',
    auth,
    requireOrderCafeScope,
    async (req: Request, res: Response) => {
      try {
        const cafeId = getOrderCafeId(req);
        const id = parseInt(req.params.id, 10);
        const { status } = req.body as { status?: string };

        if (!status) {
          res.status(400).json({ error: 'Status is required' });
          return;
        }

        const validStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
          res.status(400).json({ error: 'Invalid status' });
          return;
        }

        const currentOrder = await Order.getById(id, cafeId);
        if (!currentOrder) {
          res.status(404).json({ error: 'Order not found' });
          return;
        }

        const updatedOrder = await Order.updateStatus(id, status, cafeId);

        const wsManager = getWsManager();
        if (wsManager) {
          wsManager.broadcastOrderStatusUpdate(updatedOrder);
        }

        let loyaltyUpdate: unknown = null;
        if (
          status === 'completed' &&
          currentOrder.status !== 'completed' &&
          updatedOrder.customer_id &&
          !(currentOrder as { points_awarded?: boolean }).points_awarded
        ) {
          try {
            const pointsEarned = Math.floor(updatedOrder.final_amount / 10);
            const updatedCustomer = await Customer.updateLoyaltyData(
              updatedOrder.customer_id,
              updatedOrder.final_amount,
              pointsEarned,
              cafeId
            );
            await Order.markPointsAwarded(id, cafeId);

            loyaltyUpdate = {
              pointsEarned,
              newTotalPoints: updatedCustomer.loyalty_points,
              message: `Awarded ${pointsEarned} loyalty points for completed order`
            };
          } catch (loyaltyError) {
            logger.error('Error awarding loyalty points:', loyaltyError as Error);
            loyaltyUpdate = {
              error: 'Failed to award loyalty points',
              details: (loyaltyError as Error).message
            };
          }
        }

        res.json({
          ...updatedOrder,
          loyaltyUpdate
        });
      } catch (error) {
        logger.error('Error updating order status:', error as Error);
        res.status(500).json({ error: 'Failed to update order status' });
      }
    }
  );

  app.get('/api/orders/:id/print', auth, requireOrderCafeScope, orderPrintHandler);
  app.post('/api/orders/:id/print', auth, requireOrderCafeScope, orderPrintHandler);

  app.put('/api/orders/:id', auth, requireOrderCafeScope, async (req: Request, res: Response) => {
    try {
      const cafeId = getOrderCafeId(req);
      const id = parseInt(req.params.id, 10);
      const orderData = req.body;

      if (!orderData) {
        res.status(400).json({ error: 'Order data is required' });
        return;
      }

      const updatedOrder = await Order.update(id, orderData, cafeId);

      const wsManager = getWsManager();
      if (wsManager) {
        wsManager.broadcastOrderStatusUpdate(updatedOrder);
      }

      res.json(updatedOrder);
    } catch (error) {
      logger.error('Error updating order:', error as Error);
      res.status(500).json({ error: 'Failed to update order' });
    }
  });

  app.post(
    '/api/orders',
    auth,
    requireActiveSubscription,
    requireOrderCafeScope,
    async (req: Request, res: Response) => {
      try {
        const cafeId = getOrderCafeId(req);
        if (!cafeId) {
          res.status(400).json({
            error: 'Unable to determine cafe. Please ensure you are logged in and belong to a cafe.'
          });
          return;
        }
        const orderData = { ...req.body, cafe_id: cafeId };

        if (!orderData.items || orderData.items.length === 0) {
          res.status(400).json({ error: 'Order must contain at least one item' });
          return;
        }

        const newOrder = await Order.create(orderData);

        const wsMgr = getWsManager();
        if (wsMgr) {
          wsMgr.broadcastNewOrder(newOrder);
        }

        res.status(201).json(newOrder);
      } catch (error) {
        logger.error('Error creating order:', error as Error);
        res.status(500).json({ error: 'Failed to create order' });
      }
    }
  );

  app.post(
    '/api/orders/test',
    auth,
    requireOrderCafeScope,
    async (req: Request, res: Response) => {
      try {
        const cafeId = getOrderCafeId(req);
        if (!cafeId) {
          res.status(400).json({
            error: 'Unable to determine cafe. Please ensure you are logged in and belong to a cafe.'
          });
          return;
        }
        const menuItems = await MenuItem.getAll(cafeId);

        if (menuItems.length === 0) {
          res.status(400).json({
            error: 'No menu items available. Please add menu items first.'
          });
          return;
        }

        const firstItem = menuItems[0];
        const secondItem = menuItems[1] || firstItem;

        const testOrder = {
          cafe_id: cafeId,
          customer_name: 'Test Customer',
          customer_email: 'test@example.com',
          customer_phone: '+91 98765 43210',
          items: [
            {
              menu_item_id: firstItem.id,
              name: firstItem.name,
              quantity: 2,
              price: firstItem.price,
              total: firstItem.price * 2
            },
            {
              menu_item_id: secondItem.id,
              name: secondItem.name,
              quantity: 1,
              price: secondItem.price,
              total: secondItem.price
            }
          ],
          total_amount: firstItem.price * 2 + secondItem.price,
          tip_amount: 20.0,
          payment_method: 'cash',
          notes: 'Test order for kitchen display'
        };
        const testSubtotal = firstItem.price * 2 + secondItem.price;
        const testTax = await TaxSettings.calculateTax(testSubtotal, cafeId);
        testOrder.tax_amount = testTax.taxAmount;
        testOrder.final_amount = testSubtotal + testTax.taxAmount + 20.0;

        const newOrder = await Order.create(testOrder);

        const wsMgr = getWsManager();
        if (wsMgr) {
          wsMgr.broadcastNewOrder(newOrder);
        }

        res.status(201).json(newOrder);
      } catch (error) {
        logger.error('Error creating test order:', error as Error);
        res.status(500).json({
          error: 'Failed to create test order',
          details: (error as Error).message
        });
      }
    }
  );
}
