const WebSocket = require('ws');

class WebSocketManager {
  constructor(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws/orders'
    });
    this.clients = new Set();
    
    this.wss.on('connection', (ws, req) => {
      console.log('[WebSocket] New client connected');
      this.clients.add(ws);
      
      ws.on('close', (code, reason) => {
        console.log('[WebSocket] Client disconnected', { code, reason: reason?.toString() });
        this.clients.delete(ws);
      });
      
      ws.on('error', (error) => {
        console.error('[WebSocket] Connection error:', error.message);
        this.clients.delete(ws);
      });
      
      // Send initial connection confirmation
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'connected',
            message: 'Connected to order updates'
          }));
        }
      } catch (error) {
        console.error('[WebSocket] Error sending initial message:', error);
      }
    });

    this.wss.on('error', (error) => {
      console.error('[WebSocket] Server error:', error);
    });
  }
  
  // Broadcast order updates to all connected clients
  broadcastOrderUpdate(type, data) {
    const message = JSON.stringify({
      type,
      ...data,
      timestamp: new Date().toISOString()
    });
    
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          console.error('Error sending WebSocket message:', error);
          this.clients.delete(client);
        }
      }
    });
  }
  
  // Broadcast new order
  broadcastNewOrder(order) {
    this.broadcastOrderUpdate('order_created', { order });
  }
  
  // Broadcast order status update (convenience method)
  broadcastOrderStatusUpdate(order) {
    this.broadcastOrderUpdate('order_updated', { order });
  }
  
  // Broadcast order deletion
  broadcastOrderDeletion(orderId) {
    this.broadcastOrderUpdate('order_deleted', { orderId });
  }
  
  // Get connected clients count
  getConnectedClientsCount() {
    return this.clients.size;
  }
}

module.exports = WebSocketManager;
