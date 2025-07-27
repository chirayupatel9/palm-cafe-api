const { pool } = require('../config/database');

class Order {
  // Get all orders
  static async getAll() {
    try {
      const [orderCount] = await pool.execute('SELECT COUNT(*) as count FROM orders');
      
      const [rows] = await pool.execute(`
        SELECT 
          o.id,
          o.order_number,
          o.customer_id,
          o.customer_name,
          o.customer_email,
          o.customer_phone,
          o.total_amount,
          o.tax_amount,
          o.tip_amount,
          o.points_redeemed,
          o.points_awarded,
          o.final_amount,
          o.status,
          o.payment_method,
          o.split_payment,
          o.split_payment_method,
          o.split_amount,
          o.notes,
          o.created_at,
          o.updated_at,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', oi.id,
              'menu_item_id', oi.menu_item_id,
              'name', COALESCE(mi.name, oi.item_name),
              'quantity', oi.quantity,
              'price', oi.unit_price,
              'total', oi.total_price
            )
          ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `);
      
      const result = rows.map(order => {
        let items = [];
        
        // Handle items - they might be objects, arrays, or null
        if (order.items) {
          if (Array.isArray(order.items)) {
            // Already an array
            items = order.items.filter(item => item && item.id !== null);
          } else if (typeof order.items === 'string') {
            // JSON string that needs parsing
            try {
              const parsed = JSON.parse(order.items);
              items = Array.isArray(parsed) ? parsed.filter(item => item && item.id !== null) : [];
            } catch (error) {
              items = [];
            }
          } else if (typeof order.items === 'object') {
            // Single object, wrap in array
            items = [order.items].filter(item => item && item.id !== null);
          }
        }
        
        return {
          ...order,
          items: items,
          total_amount: parseFloat(order.total_amount),
          tax_amount: parseFloat(order.tax_amount),
          tip_amount: parseFloat(order.tip_amount),
          points_redeemed: parseInt(order.points_redeemed || 0),
          points_awarded: Boolean(order.points_awarded),
          final_amount: parseFloat(order.final_amount),
          split_payment: Boolean(order.split_payment),
          split_amount: parseFloat(order.split_amount || 0),
          extra_charge: parseFloat(order.extra_charge || 0),
          extra_charge_note: order.extra_charge_note || null
        };
      });
      
      return result;
    } catch (error) {
      console.error('Error in getAll:', error);
      throw new Error(`Error fetching orders: ${error.message}`);
    }
  }

  // Get order by ID
  static async getById(id) {
    try {
      const [rows] = await pool.execute(`
        SELECT 
          o.id,
          o.order_number,
          o.customer_id,
          o.customer_name,
          o.customer_email,
          o.customer_phone,
          o.total_amount,
          o.tax_amount,
          o.tip_amount,
          o.points_redeemed,
          o.points_awarded,
          o.final_amount,
          o.status,
          o.payment_method,
          o.split_payment,
          o.split_payment_method,
          o.split_amount,
          o.notes,
          o.created_at,
          o.updated_at,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', oi.id,
              'menu_item_id', oi.menu_item_id,
              'name', COALESCE(mi.name, oi.item_name),
              'quantity', oi.quantity,
              'price', oi.unit_price,
              'total', oi.total_price
            )
          ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.id = ?
        GROUP BY o.id
      `, [id]);

      if (rows.length === 0) {
        return null;
      }

      const order = rows[0];
      let items = [];
      
      // Handle items - they might be objects, arrays, or null
      if (order.items) {
        if (Array.isArray(order.items)) {
          // Already an array
          items = order.items.filter(item => item && item.id !== null);
        } else if (typeof order.items === 'string') {
          // JSON string that needs parsing
          try {
            const parsed = JSON.parse(order.items);
            items = Array.isArray(parsed) ? parsed.filter(item => item && item.id !== null) : [];
          } catch (error) {
            items = [];
          }
        } else if (typeof order.items === 'object') {
          // Single object, wrap in array
          items = [order.items].filter(item => item && item.id !== null);
        }
      }
      
      return {
        ...order,
        items: items,
        total_amount: parseFloat(order.total_amount),
        tax_amount: parseFloat(order.tax_amount),
        tip_amount: parseFloat(order.tip_amount),
        points_redeemed: parseInt(order.points_redeemed || 0),
        points_awarded: Boolean(order.points_awarded),
        final_amount: parseFloat(order.final_amount),
        split_payment: Boolean(order.split_payment),
        split_amount: parseFloat(order.split_amount || 0),
        extra_charge: parseFloat(order.extra_charge || 0),
        extra_charge_note: order.extra_charge_note || null
      };
    } catch (error) {
      throw new Error(`Error fetching order: ${error.message}`);
    }
  }

  // Create new order
  static async create(orderData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

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

      // Generate order number
      const orderNumber = `ORD${Date.now()}`;

      // Handle undefined values by converting them to null
      const safeCustomerName = customer_name || null;
      const safeCustomerEmail = customer_email || null;
      const safeCustomerPhone = customer_phone || null;
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

      // Create order
      const [orderResult] = await connection.execute(`
        INSERT INTO orders (
          order_number, customer_id, customer_name, customer_email, customer_phone,
          total_amount, tax_amount, tip_amount, points_redeemed, final_amount,
          payment_method, split_payment, split_payment_method, split_amount, extra_charge, extra_charge_note, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `, [
        orderNumber, null, safeCustomerName, safeCustomerEmail, safeCustomerPhone,
        safeTotalAmount, safeTaxAmount, safeTipAmount, orderData.points_redeemed || 0, safeFinalAmount,
        safePaymentMethod, safeSplitPayment, safeSplitPaymentMethod, safeSplitAmount, safeExtraCharge, safeExtraChargeNote, safeNotes
      ]);

      const orderId = orderResult.insertId;

      // Create order items
      for (const item of items) {
        // Handle undefined values for order items
        const safeMenuItemId = item.menu_item_id || item.id || null;
        const safeItemName = item.name || null;
        const safeQuantity = item.quantity || 0;
        const safeUnitPrice = item.price || 0;
        const safeTotalPrice = item.total || 0;
        
        await connection.execute(`
          INSERT INTO order_items (
            order_id, menu_item_id, item_name, quantity, unit_price, total_price
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          orderId, safeMenuItemId, safeItemName, safeQuantity, safeUnitPrice, safeTotalPrice
        ]);
      }

      await connection.commit();
      
      const result = await this.getById(orderId);
      return result;
    } catch (error) {
      console.error('Error creating order:', error);
      await connection.rollback();
      throw new Error(`Error creating order: ${error.message}`);
    } finally {
      connection.release();
    }
  }

  // Update order status
  static async updateStatus(id, status) {
    try {
      const [result] = await pool.execute(`
        UPDATE orders 
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [status, id]);

      if (result.affectedRows === 0) {
        throw new Error('Order not found');
      }

      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error updating order status: ${error.message}`);
    }
  }

  // Mark points as awarded for an order
  static async markPointsAwarded(id) {
    try {
      const [result] = await pool.execute(`
        UPDATE orders 
        SET points_awarded = TRUE, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [id]);

      if (result.affectedRows === 0) {
        throw new Error('Order not found');
      }

      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error marking points as awarded: ${error.message}`);
    }
  }

  // Get orders by customer phone
  static async getByCustomerPhone(customerPhone) {
    try {
      const [rows] = await pool.execute(`
        SELECT 
          o.id,
          o.order_number,
          o.customer_name,
          o.customer_email,
          o.customer_phone,
          o.total_amount,
          o.tax_amount,
          o.tip_amount,
          o.final_amount,
          o.status,
          o.payment_method,
          o.notes,
          o.created_at,
          o.updated_at,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', oi.id,
              'menu_item_id', oi.menu_item_id,
              'name', COALESCE(mi.name, oi.item_name),
              'quantity', oi.quantity,
              'price', oi.unit_price,
              'total', oi.total_price
            )
          ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.customer_phone = ?
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `, [customerPhone]);

      return rows.map(order => {
        let items = [];
        
        // Handle items - they might be objects, arrays, or null
        if (order.items) {
          if (Array.isArray(order.items)) {
            // Already an array
            items = order.items.filter(item => item && item.id !== null);
          } else if (typeof order.items === 'string') {
            // JSON string that needs parsing
            try {
              const parsed = JSON.parse(order.items);
              items = Array.isArray(parsed) ? parsed.filter(item => item && item.id !== null) : [];
            } catch (error) {
              items = [];
            }
          } else if (typeof order.items === 'object') {
            // Single object, wrap in array
            items = [order.items].filter(item => item && item.id !== null);
          }
        }
        
        return {
          ...order,
          items: items,
          total_amount: parseFloat(order.total_amount),
          tax_amount: parseFloat(order.tax_amount),
          tip_amount: parseFloat(order.tip_amount),
          final_amount: parseFloat(order.final_amount)
        };
      });
    } catch (error) {
      throw new Error(`Error fetching orders by customer phone: ${error.message}`);
    }
  }

  // Get orders by order number
  static async getByOrderNumber(orderNumber) {
    try {
      const [rows] = await pool.execute(`
        SELECT 
          o.id,
          o.order_number,
          o.customer_name,
          o.customer_email,
          o.customer_phone,
          o.total_amount,
          o.tax_amount,
          o.tip_amount,
          o.final_amount,
          o.status,
          o.payment_method,
          o.notes,
          o.created_at,
          o.updated_at,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', oi.id,
              'menu_item_id', oi.menu_item_id,
              'name', COALESCE(mi.name, oi.item_name),
              'quantity', oi.quantity,
              'price', oi.unit_price,
              'total', oi.total_price
            )
          ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.order_number = ?
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `, [orderNumber]);

      return rows.map(order => {
        let items = [];
        
        // Handle items - they might be objects, arrays, or null
        if (order.items) {
          if (Array.isArray(order.items)) {
            // Already an array
            items = order.items.filter(item => item && item.id !== null);
          } else if (typeof order.items === 'string') {
            // JSON string that needs parsing
            try {
              const parsed = JSON.parse(order.items);
              items = Array.isArray(parsed) ? parsed.filter(item => item && item.id !== null) : [];
            } catch (error) {
              items = [];
            }
          } else if (typeof order.items === 'object') {
            // Single object, wrap in array
            items = [order.items].filter(item => item && item.id !== null);
          }
        }
        
        return {
          ...order,
          items: items,
          total_amount: parseFloat(order.total_amount),
          tax_amount: parseFloat(order.tax_amount),
          tip_amount: parseFloat(order.tip_amount),
          final_amount: parseFloat(order.final_amount)
        };
      });
    } catch (error) {
      throw new Error(`Error fetching orders by order number: ${error.message}`);
    }
  }

  // Get orders by status
  static async getByStatus(status) {
    try {
      const [rows] = await pool.execute(`
        SELECT 
          o.id,
          o.order_number,
          o.customer_name,
          o.customer_email,
          o.customer_phone,
          o.total_amount,
          o.tax_amount,
          o.tip_amount,
          o.final_amount,
          o.status,
          o.payment_method,
          o.notes,
          o.created_at,
          o.updated_at,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', oi.id,
              'menu_item_id', oi.menu_item_id,
              'name', COALESCE(mi.name, oi.item_name),
              'quantity', oi.quantity,
              'price', oi.unit_price,
              'total', oi.total_price
            )
          ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.status = ?
        GROUP BY o.id
        ORDER BY o.created_at ASC
      `, [status]);

      return rows.map(order => {
        let items = [];
        
        // Handle items - they might be objects, arrays, or null
        if (order.items) {
          if (Array.isArray(order.items)) {
            // Already an array
            items = order.items.filter(item => item && item.id !== null);
          } else if (typeof order.items === 'string') {
            // JSON string that needs parsing
            try {
              const parsed = JSON.parse(order.items);
              items = Array.isArray(parsed) ? parsed.filter(item => item && item.id !== null) : [];
            } catch (error) {
              items = [];
            }
          } else if (typeof order.items === 'object') {
            // Single object, wrap in array
            items = [order.items].filter(item => item && item.id !== null);
          }
        }
        
        return {
          ...order,
          items: items,
          total_amount: parseFloat(order.total_amount),
          tax_amount: parseFloat(order.tax_amount),
          tip_amount: parseFloat(order.tip_amount),
          final_amount: parseFloat(order.final_amount)
        };
      });
    } catch (error) {
      throw new Error(`Error fetching orders by status: ${error.message}`);
    }
  }

  // Get order statistics
  static async getStatistics() {
    try {
      const [totalOrders] = await pool.execute('SELECT COUNT(*) as count FROM orders');
      const [pendingOrders] = await pool.execute("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'");
      const [preparingOrders] = await pool.execute("SELECT COUNT(*) as count FROM orders WHERE status = 'preparing'");
      const [readyOrders] = await pool.execute("SELECT COUNT(*) as count FROM orders WHERE status = 'ready'");
      const [completedOrders] = await pool.execute("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'");

      return {
        total: totalOrders[0].count,
        pending: pendingOrders[0].count,
        preparing: preparingOrders[0].count,
        ready: readyOrders[0].count,
        completed: completedOrders[0].count
      };
    } catch (error) {
      throw new Error(`Error fetching order statistics: ${error.message}`);
    }
  }
}

module.exports = Order; 