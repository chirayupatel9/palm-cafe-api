const WebSocket = require('ws');
const logger = require('./config/logger');

class WebSocketManager {
  constructor(server) {
    this.wss = new WebSocket.Server({
      server,
      path: '/ws/orders'
    });
    this.clients = new Set();

    this.wss.on('connection', (ws, req) => {
      logger.debug('WebSocket client connected');
      this.clients.add(ws);

      ws.on('close', (code, reason) => {
        logger.debug('WebSocket client disconnected', { code });
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        logger.warn('WebSocket connection error', { message: error.message });
        this.clients.delete(ws);
      });

      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'connected',
            message: 'Connected to order updates'
          }));
        }
      } catch (error) {
        logger.error('WebSocket error sending initial message', { message: error.message });
      }
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', { message: error.message });
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
          logger.warn('WebSocket send error', { message: error.message });
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
