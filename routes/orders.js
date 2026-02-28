const Order = require('../models/order');
const Customer = require('../models/customer');
const Cafe = require('../models/cafe');
const MenuItem = require('../models/menuItem');
const TaxSettings = require('../models/taxSettings');
const { pool } = require('../config/database');
const { getOrderCafeId, requireOrderCafeScope, parseListLimitOffset, isInvalidCustomerPhone } = require('./helpers');
const { auth, adminAuth, chefAuth } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscriptionAuth');
const { isMalformedString, validateRequiredString, sanitizeString } = require('../middleware/validateInput');
const logger = require('../config/logger');

module.exports = function registerOrders(app) {
app.get('/api/orders', auth, requireActiveSubscription, requireOrderCafeScope, async (req, res) => {
  try {
    const cafeId = getOrderCafeId(req);
    const { customer_phone, order_number } = req.query;
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
    logger.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get customer orders (public endpoint; scope by cafeSlug for multi-cafe)
app.get('/api/customer/orders', async (req, res) => {
  try {
    const { customer_phone, cafeSlug } = req.query;

    if (isInvalidCustomerPhone(customer_phone)) {
      return res.status(400).json({ error: 'Customer phone number is required' });
    }

    let cafeId = null;
    if (cafeSlug && !isMalformedString(cafeSlug)) {
      const cafe = await Cafe.getBySlug(cafeSlug);
      if (cafe) cafeId = cafe.id;
    }
    const orders = await Order.getByCustomerPhone(customer_phone, cafeId);
    res.json(orders);
  } catch (error) {
    logger.error('Error fetching customer orders:', error);
    res.status(500).json({ error: 'Failed to fetch customer orders' });
  }
});

// Create customer order (public endpoint)
app.post('/api/customer/orders', async (req, res) => {
  try {
    let { customerName, customerPhone, customerEmail, tableNumber, paymentMethod, items, tipAmount, pointsRedeemed, date, pickupOption } = req.body;

    const nameErr = validateRequiredString(customerName, 'Customer name');
    if (nameErr) {
      return res.status(400).json({ error: nameErr });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one order item is required' });
    }
    const hasInvalidItem = items.some(item => item.id == null && item.menu_item_id == null);
    if (hasInvalidItem) {
      return res.status(400).json({ error: 'Each order item must have an id' });
    }

    if (isInvalidCustomerPhone(customerPhone)) {
      customerPhone = null;
    }

    // Calculate subtotal (guard against NaN)
    const subtotal = items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
    if (Number.isNaN(subtotal) || subtotal < 0) {
      return res.status(400).json({ error: 'Invalid item prices or quantities' });
    }
    const cafeSlug = req.query.cafeSlug || req.body.cafeSlug || 'default';

    let cafe = await Cafe.getBySlug(cafeSlug);
    if (!cafe) {
      cafe = await Cafe.getFirstActive();
    }
    const cafeIdForTax = cafe ? cafe.id : null;
    const taxCalculation = await TaxSettings.calculateTax(subtotal, cafeIdForTax);

    const cafeId = cafe ? cafe.id : null;
    if (!cafeId) {
      return res.status(400).json({
        error: 'Unable to determine cafe. Please provide a valid cafe slug.'
      });
    }

    // Calculate total
    const tipAmountNum = parseFloat(tipAmount) || 0;
    const pointsRedeemedNum = parseInt(pointsRedeemed) || 0;
    const pointsDiscount = pointsRedeemedNum * 0.1; // 1 point = 0.1 INR
    const total = subtotal + taxCalculation.taxAmount + tipAmountNum - pointsDiscount;

    // Check if customer exists or create new one (scoped to this cafe)
    let customer = null;
    if (customerPhone || customerName) {
      customer = await Customer.findByEmailOrPhone(customerEmail || null, customerPhone || null, cafeId);
      
      if (!customer && customerPhone) {
        // Create new customer if phone number provided
        customer = await Customer.create({
          name: customerName,
          phone: customerPhone,
          email: customerEmail || null,
          address: null,
          date_of_birth: null,
          notes: 'Auto-created from customer order',
          cafe_id: cafeId
        });
      }
    }

    // Create order data (never store literal "undefined" for customer_phone or customer_name)
    const orderData = {
      cafe_id: cafeId,
      customer_name: sanitizeString(customerName),
      customer_email: sanitizeString(customerEmail),
      customer_phone: customerPhone,
      table_number: tableNumber || null,
      items: items.map(item => ({
        menu_item_id: item.id != null ? item.id : item.menu_item_id,
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
      split_payment: false, // Customers cannot use split payment
      split_payment_method: null,
      split_amount: 0,
      extra_charge: 0,
      extra_charge_note: null,
      notes: pickupOption === 'delivery' ? 'Delivery order' : 'Pickup order'
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
    logger.error('Error creating customer order:', { message: error.message, stack: error.stack });
    const isProd = process.env.NODE_ENV === 'production';
    const errorMessage = (error && error.message) ? String(error.message) : 'Failed to create order';
    res.status(500).json({
      error: isProd ? 'Failed to create order' : errorMessage,
      code: 'ORDER_CREATE_FAILED'
    });
  }
});

// Update order status
app.patch('/api/orders/:id/status', auth, requireOrderCafeScope, async (req, res) => {
  try {
    const cafeId = getOrderCafeId(req);
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const validStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const currentOrder = await Order.getById(id, cafeId);
    if (!currentOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const updatedOrder = await Order.updateStatus(id, status, cafeId);
    
    // Broadcast order update via WebSocket
    if (global.wsManager) {
      global.wsManager.broadcastOrderStatusUpdate(updatedOrder);
    }
    
    // Award loyalty points when order is completed (only if not already awarded)
    let loyaltyUpdate = null;
    if (status === 'completed' && currentOrder.status !== 'completed' && updatedOrder.customer_id && !currentOrder.points_awarded) {
      try {
        const pointsEarned = Math.floor(updatedOrder.final_amount / 10);
        const updatedCustomer = await Customer.updateLoyaltyData(updatedOrder.customer_id, updatedOrder.final_amount, pointsEarned, cafeId);
        await Order.markPointsAwarded(id, cafeId);
        
        loyaltyUpdate = {
          pointsEarned,
          newTotalPoints: updatedCustomer.loyalty_points,
          message: `Awarded ${pointsEarned} loyalty points for completed order`
        };
        
      } catch (loyaltyError) {
        logger.error('Error awarding loyalty points:', loyaltyError);
        loyaltyUpdate = {
          error: 'Failed to award loyalty points',
          details: loyaltyError.message
        };
      }
    }
    
    res.json({
      ...updatedOrder,
      loyaltyUpdate
    });
  } catch (error) {
    logger.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Update order details
app.put('/api/orders/:id', auth, requireOrderCafeScope, async (req, res) => {
  try {
    const cafeId = getOrderCafeId(req);
    const { id } = req.params;
    const orderData = req.body;
    
    if (!orderData) {
      return res.status(400).json({ error: 'Order data is required' });
    }

    const updatedOrder = await Order.update(id, orderData, cafeId);
    
    // Broadcast order update via WebSocket
    if (global.wsManager) {
      global.wsManager.broadcastOrderStatusUpdate(updatedOrder);
    }
    
    res.json(updatedOrder);
  } catch (error) {
    logger.error('Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Create new order
app.post('/api/orders', auth, requireActiveSubscription, requireOrderCafeScope, async (req, res) => {
  try {
    const cafeId = getOrderCafeId(req);
    if (!cafeId) {
      return res.status(400).json({ error: 'Unable to determine cafe. Please ensure you are logged in and belong to a cafe.' });
    }
    const orderData = { ...req.body, cafe_id: cafeId };
    
    if (!orderData.items || orderData.items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    const newOrder = await Order.create(orderData);
    
    // Broadcast new order via WebSocket
    if (global.wsManager) {
      global.wsManager.broadcastNewOrder(newOrder);
    }
    
    res.status(201).json(newOrder);
  } catch (error) {
    logger.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Create test order (for debugging)
app.post('/api/orders/test', auth, requireOrderCafeScope, async (req, res) => {
  try {
    const cafeId = getOrderCafeId(req);
    if (!cafeId) {
      return res.status(400).json({ error: 'Unable to determine cafe. Please ensure you are logged in and belong to a cafe.' });
    }
    const menuItems = await MenuItem.getAll(cafeId);
    
    if (menuItems.length === 0) {
      return res.status(400).json({ error: 'No menu items available. Please add menu items first.' });
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
      total_amount: (firstItem.price * 2) + secondItem.price,
      tax_amount: ((firstItem.price * 2) + secondItem.price) * 0.085,
      tip_amount: 20.00,
      final_amount: ((firstItem.price * 2) + secondItem.price) * 1.085 + 20.00,
      payment_method: 'cash',
      notes: 'Test order for kitchen display'
    };
    
    const newOrder = await Order.create(testOrder);
    
    // Broadcast new test order via WebSocket
    if (global.wsManager) {
      global.wsManager.broadcastNewOrder(newOrder);
    }
    
    res.status(201).json(newOrder);
  } catch (error) {
    logger.error('Error creating test order:', error);
    res.status(500).json({ error: 'Failed to create test order', details: error.message });
  }
});
};
