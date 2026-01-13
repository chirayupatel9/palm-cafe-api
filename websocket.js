const WebSocket = require('ws');

class WebSocketManager {
  constructor(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws/orders'
    });
    this.clients = new Set();
    
    this.wss.on('connection', (ws, req) => {
      console.log('New WebSocket connection established');
      this.clients.add(ws);
      
      ws.on('close', () => {
        console.log('WebSocket connection closed');
        this.clients.delete(ws);
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
      
      // Send initial connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to order updates'
      }));
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
