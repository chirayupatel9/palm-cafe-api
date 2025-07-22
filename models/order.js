const { pool } = require('../config/database');

class Order {
  // Get all orders
  static async getAll() {
    try {
      console.log('🔍 Fetching all orders...');
      
      // First, let's check if there are any orders at all
      const [orderCount] = await pool.execute('SELECT COUNT(*) as count FROM orders');
      console.log('📊 Total orders in database:', orderCount[0].count);
      
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
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `);
      
      console.log('✅ Orders fetched successfully:', rows.length);
      
      const result = rows.map(order => {
        let items = [];
        
        // Debug: Log the type and content of items
        console.log(`🔍 Order ${order.id} items type:`, typeof order.items);
        console.log(`🔍 Order ${order.id} items content:`, order.items);
        
        // Handle items - they might be objects, arrays, or null
        if (order.items) {
          if (Array.isArray(order.items)) {
            // Already an array
            console.log(`✅ Order ${order.id}: Items is already an array`);
            items = order.items.filter(item => item && item.id !== null);
          } else if (typeof order.items === 'string') {
            // JSON string that needs parsing
            console.log(`📝 Order ${order.id}: Items is a string, parsing JSON`);
            try {
              const parsed = JSON.parse(order.items);
              items = Array.isArray(parsed) ? parsed.filter(item => item && item.id !== null) : [];
            } catch (error) {
              console.log('⚠️ JSON parse error for order items:', order.items, error.message);
              items = [];
            }
          } else if (typeof order.items === 'object') {
            // Single object, wrap in array
            console.log(`📦 Order ${order.id}: Items is an object, wrapping in array`);
            items = [order.items].filter(item => item && item.id !== null);
          }
        } else {
          console.log(`❌ Order ${order.id}: No items found`);
        }
        
        console.log(`📋 Order ${order.id}: Final items count:`, items.length);
        
        return {
          ...order,
          items: items,
          total_amount: parseFloat(order.total_amount),
          tax_amount: parseFloat(order.tax_amount),
          tip_amount: parseFloat(order.tip_amount),
          final_amount: parseFloat(order.final_amount)
        };
      });
      
      console.log('📋 Processed orders:', result.length);
      return result;
    } catch (error) {
      console.error('❌ Error in getAll:', error);
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
            console.log('⚠️ JSON parse error for order items:', order.items, error.message);
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
    } catch (error) {
      throw new Error(`Error fetching order: ${error.message}`);
    }
  }

  // Create new order
  static async create(orderData) {
    const connection = await pool.getConnection();
    try {
      console.log('🔍 Order.create: Starting order creation...');
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
        notes
      } = orderData;

      console.log('📝 Order.create: Order data received:', {
        customer_name,
        items_count: items.length,
        total_amount,
        final_amount
      });

      // Generate order number
      const orderNumber = `ORD${Date.now()}`;
      console.log('🔢 Order.create: Generated order number:', orderNumber);

      // Create order
      const [orderResult] = await connection.execute(`
        INSERT INTO orders (
          order_number, customer_name, customer_email, customer_phone,
          total_amount, tax_amount, tip_amount, final_amount,
          payment_method, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `, [
        orderNumber, customer_name, customer_email, customer_phone,
        total_amount, tax_amount, tip_amount, final_amount,
        payment_method, notes
      ]);

      const orderId = orderResult.insertId;
      console.log('✅ Order.create: Order created with ID:', orderId);

      // Create order items
      console.log('🍽️ Order.create: Creating order items...');
      for (const item of items) {
        console.log('📦 Order.create: Processing item:', item);
        await connection.execute(`
          INSERT INTO order_items (
            order_id, menu_item_id, item_name, quantity, unit_price, total_price
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          orderId, item.menu_item_id, item.name, item.quantity, item.price, item.total
        ]);
        console.log('✅ Order.create: Item created successfully');
      }

      await connection.commit();
      console.log('✅ Order.create: Transaction committed successfully');
      
      const result = await this.getById(orderId);
      console.log('✅ Order.create: Returning created order:', result.id);
      return result;
    } catch (error) {
      console.error('❌ Order.create: Error occurred:', error);
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
              console.log('⚠️ JSON parse error for order items:', order.items, error.message);
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