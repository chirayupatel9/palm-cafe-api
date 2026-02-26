const { pool } = require('../config/database');
const CafeDailyMetrics = require('./cafeDailyMetrics');
const logger = require('../config/logger');

class Order {
  // Get all orders (optionally scoped by cafeId for multi-cafe)
  static async getAll(cafeId = null) {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute(
        `SELECT 
          o.id,
          o.order_number,
          o.customer_id,
          o.customer_name,
          o.customer_email,
          o.customer_phone,
          o.table_number,
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
          o.extra_charge,
          o.extra_charge_note,
          o.notes,
          o.created_at,
          o.updated_at,
          o.cafe_id,
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
        ${hasCafeId ? 'WHERE o.cafe_id = ?' : ''}
        GROUP BY o.id
        ORDER BY o.created_at DESC`,
        hasCafeId ? [cafeId] : []
      );
      
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
      logger.error('Error in getAll:', error);
      throw new Error(`Error fetching orders: ${error.message}`);
    }
  }

  // Get order by ID (optionally scoped by cafeId for multi-cafe)
  static async getById(id, cafeId = null) {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute(
        `SELECT 
          o.id,
          o.order_number,
          o.customer_id,
          o.customer_name,
          o.customer_email,
          o.customer_phone,
          o.table_number,
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
          o.extra_charge,
          o.extra_charge_note,
          o.notes,
          o.created_at,
          o.updated_at,
          o.cafe_id,
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
        WHERE o.id = ? ${hasCafeId ? 'AND o.cafe_id = ?' : ''}
        GROUP BY o.id`,
        hasCafeId ? [id, cafeId] : [id]
      );

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

      // Generate order number
      const orderNumber = `ORD${Date.now()}`;

      // Handle undefined values by converting them to null (never store literal "undefined")
      const safeCustomerName = customer_name || null;
      const safeCustomerEmail = customer_email || null;
      const safeCustomerPhone = (customer_phone && String(customer_phone).trim() !== '' && String(customer_phone) !== 'undefined') ? customer_phone : null;
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

      // Check if cafe_id column exists and get cafe_id
      const [cafeIdColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'orders' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = cafeIdColumns.length > 0;
      const cafeId = orderData.cafe_id || null;

      // Build INSERT statement dynamically
      let insertFields = [
        'order_number', 'customer_id', 'customer_name', 'customer_email', 'customer_phone', 'table_number',
        'total_amount', 'tax_amount', 'tip_amount', 'points_redeemed', 'final_amount',
        'payment_method', 'split_payment', 'split_payment_method', 'split_amount', 'extra_charge', 'extra_charge_note', 'notes', 'status'
      ];
      let insertValues = [
        orderNumber, null, safeCustomerName, safeCustomerEmail, safeCustomerPhone, table_number || null,
        safeTotalAmount, safeTaxAmount, safeTipAmount, orderData.points_redeemed || 0, safeFinalAmount,
        safePaymentMethod, safeSplitPayment, safeSplitPaymentMethod, safeSplitAmount, safeExtraCharge, safeExtraChargeNote, safeNotes, 'pending'
      ];

      if (hasCafeId && cafeId) {
        insertFields.push('cafe_id');
        insertValues.push(cafeId);
      }

      // Create order
      const [orderResult] = await connection.execute(`
        INSERT INTO orders (${insertFields.join(', ')})
        VALUES (${insertFields.map(() => '?').join(', ')})
      `, insertValues);

      const orderId = orderResult.insertId;

      // Batch insert order items (single query instead of N for faster response)
      if (items.length > 0) {
        const itemRows = items.map(item => {
          const safeMenuItemId = item.menu_item_id || item.id || null;
          const safeItemName = item.name || null;
          const safeQuantity = item.quantity || 0;
          const safeUnitPrice = item.price || 0;
          const safeTotalPrice = item.total || 0;
          return [orderId, safeMenuItemId, safeItemName, safeQuantity, safeUnitPrice, safeTotalPrice];
        });
        const placeholders = itemRows.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
        const flatParams = itemRows.flat();
        await connection.execute(`
          INSERT INTO order_items (order_id, menu_item_id, item_name, quantity, unit_price, total_price)
          VALUES ${placeholders}
        `, flatParams);
      }

      await connection.commit();
      
      const result = await this.getById(orderId, cafeId);
      
      // Update analytics metrics (async, non-blocking)
      if (hasCafeId && cafeId && result && result.created_at) {
        const orderDate = new Date(result.created_at).toISOString().split('T')[0];
        CafeDailyMetrics.incrementOrder(cafeId, orderDate, parseFloat(safeFinalAmount || 0), false)
          .catch(err => {
            logger.error('Error updating analytics metrics:', err);
            // Don't throw - aggregation failures shouldn't break order creation
          });
      }
      
      return result;
    } catch (error) {
      logger.error('Error creating order:', error);
      await connection.rollback();
      throw new Error(`Error creating order: ${error.message}`);
    } finally {
      connection.release();
    }
  }

  // Update order status (optionally scoped by cafeId for multi-cafe)
  static async updateStatus(id, status, cafeId = null) {
    try {
      const hasCafeId = cafeId != null;
      const orderBefore = await this.getById(id, cafeId);
      if (!orderBefore) {
        throw new Error('Order not found');
      }
      const previousStatus = orderBefore.status;
      const orderCafeId = orderBefore.cafe_id || cafeId;
      const orderDate = orderBefore.created_at ? new Date(orderBefore.created_at).toISOString().split('T')[0] : null;
      const finalAmount = parseFloat(orderBefore.final_amount || 0);

      const [result] = await pool.execute(
        `UPDATE orders 
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
        hasCafeId ? [status, id, cafeId] : [status, id]
      );

      if (result.affectedRows === 0) {
        throw new Error('Order not found');
      }

      const updatedOrder = await this.getById(id, cafeId);

      // Update analytics metrics (async, non-blocking)
      if (orderCafeId && orderDate) {
        const wasCompleted = previousStatus === 'completed';
        const isNowCompleted = status === 'completed';

        if (wasCompleted !== isNowCompleted) {
          // Status changed to/from completed - update metrics
          CafeDailyMetrics.updateOrderCompletion(orderCafeId, orderDate, finalAmount, isNowCompleted)
            .catch(err => {
              logger.error('Error updating analytics metrics:', err);
              // Don't throw - aggregation failures shouldn't break order updates
            });
        }
      }

      return updatedOrder;
    } catch (error) {
      throw new Error(`Error updating order status: ${error.message}`);
    }
  }

  // Update order details (optionally scoped by cafeId for multi-cafe)
  static async update(id, orderData, cafeId = null) {
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

      // Handle undefined values by converting them to null (never store literal "undefined")
      const safeCustomerName = customer_name || null;
      const safeCustomerEmail = customer_email || null;
      const safeCustomerPhone = (customer_phone && String(customer_phone).trim() !== '' && String(customer_phone) !== 'undefined') ? customer_phone : null;
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

      // Update order
      const [orderResult] = await connection.execute(
        `UPDATE orders SET
          customer_name = ?,
          customer_email = ?,
          customer_phone = ?,
          total_amount = ?,
          tax_amount = ?,
          tip_amount = ?,
          final_amount = ?,
          payment_method = ?,
          split_payment = ?,
          split_payment_method = ?,
          split_amount = ?,
          extra_charge = ?,
          extra_charge_note = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
        hasCafeId
          ? [safeCustomerName, safeCustomerEmail, safeCustomerPhone, safeTotalAmount, safeTaxAmount, safeTipAmount, safeFinalAmount, safePaymentMethod, safeSplitPayment, safeSplitPaymentMethod, safeSplitAmount, safeExtraCharge, safeExtraChargeNote, safeNotes, id, cafeId]
          : [safeCustomerName, safeCustomerEmail, safeCustomerPhone, safeTotalAmount, safeTaxAmount, safeTipAmount, safeFinalAmount, safePaymentMethod, safeSplitPayment, safeSplitPaymentMethod, safeSplitAmount, safeExtraCharge, safeExtraChargeNote, safeNotes, id]
      );

      if (orderResult.affectedRows === 0) {
        throw new Error('Order not found');
      }

      // If items are provided, update order items
      if (items && Array.isArray(items)) {
        // Delete existing order items
        await connection.execute('DELETE FROM order_items WHERE order_id = ?', [id]);

        // Create new order items
        for (const item of items) {
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
            id, safeMenuItemId, safeItemName, safeQuantity, safeUnitPrice, safeTotalPrice
          ]);
        }
      }

      await connection.commit();
      
      const result = await this.getById(id, cafeId);
      return result;
    } catch (error) {
      logger.error('Error updating order:', error);
      await connection.rollback();
      throw new Error(`Error updating order: ${error.message}`);
    } finally {
      connection.release();
    }
  }

  // Mark points as awarded for an order (optionally scoped by cafeId for multi-cafe)
  static async markPointsAwarded(id, cafeId = null) {
    try {
      const hasCafeId = cafeId != null;
      const [result] = await pool.execute(
        `UPDATE orders 
        SET points_awarded = TRUE, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
        hasCafeId ? [id, cafeId] : [id]
      );

      if (result.affectedRows === 0) {
        throw new Error('Order not found');
      }

      return await this.getById(id, cafeId);
    } catch (error) {
      throw new Error(`Error marking points as awarded: ${error.message}`);
    }
  }

  // Get orders by customer phone (optionally scoped by cafeId for multi-cafe)
  static async getByCustomerPhone(customerPhone, cafeId = null) {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute(
        `SELECT 
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
        WHERE o.customer_phone = ? ${hasCafeId ? 'AND o.cafe_id = ?' : ''}
        GROUP BY o.id
        ORDER BY o.created_at DESC`,
        hasCafeId ? [customerPhone, cafeId] : [customerPhone]
      );

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

  // Get orders by order number (optionally scoped by cafeId for multi-cafe)
  static async getByOrderNumber(orderNumber, cafeId = null) {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute(
        `SELECT 
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
        WHERE o.order_number = ? ${hasCafeId ? 'AND o.cafe_id = ?' : ''}
        GROUP BY o.id
        ORDER BY o.created_at DESC`,
        hasCafeId ? [orderNumber, cafeId] : [orderNumber]
      );

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

  // Get orders by status (optionally scoped by cafeId for multi-cafe)
  static async getByStatus(status, cafeId = null) {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute(
        `SELECT 
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
        WHERE o.status = ? ${hasCafeId ? 'AND o.cafe_id = ?' : ''}
        GROUP BY o.id
        ORDER BY o.created_at ASC`,
        hasCafeId ? [status, cafeId] : [status]
      );

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

  // Get order statistics (optionally scoped by cafeId for multi-cafe)
  static async getStatistics(cafeId = null) {
    try {
      const hasCafeId = cafeId != null;
      const whereClause = hasCafeId ? ' WHERE cafe_id = ?' : '';
      const params = hasCafeId ? [cafeId] : [];
      const [totalOrders] = await pool.execute(`SELECT COUNT(*) as count FROM orders${whereClause}`, params);
      const [pendingOrders] = await pool.execute(`SELECT COUNT(*) as count FROM orders WHERE status = 'pending'${hasCafeId ? ' AND cafe_id = ?' : ''}`, params);
      const [preparingOrders] = await pool.execute(`SELECT COUNT(*) as count FROM orders WHERE status = 'preparing'${hasCafeId ? ' AND cafe_id = ?' : ''}`, params);
      const [readyOrders] = await pool.execute(`SELECT COUNT(*) as count FROM orders WHERE status = 'ready'${hasCafeId ? ' AND cafe_id = ?' : ''}`, params);
      const [completedOrders] = await pool.execute(`SELECT COUNT(*) as count FROM orders WHERE status = 'completed'${hasCafeId ? ' AND cafe_id = ?' : ''}`, params);

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