import WebSocket from 'ws';
import { Server as HttpServer } from 'http';
import logger from './config/logger';

export default class WebSocketManager {
  private wss: WebSocket.Server;
  private clients: Set<WebSocket>;

  constructor(server: HttpServer) {
    this.wss = new WebSocket.Server({ server, path: '/ws/orders' });
    this.clients = new Set();
    this.wss.on('connection', (ws: WebSocket, _req: unknown) => {
      logger.debug('WebSocket client connected');
      this.clients.add(ws);
      ws.on('close', (code: number) => {
        logger.debug('WebSocket client disconnected', { code });
        this.clients.delete(ws);
      });
      ws.on('error', (error: Error) => {
        logger.warn('WebSocket connection error', { message: error.message });
        this.clients.delete(ws);
      });
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'connected', message: 'Connected to order updates' }));
        }
      } catch (error) {
        logger.error('WebSocket error sending initial message', { message: (error as Error).message });
      }
    });
    this.wss.on('error', (error: Error) => {
      logger.error('WebSocket server error', { message: error.message });
    });
  }

  broadcastOrderUpdate(type: string, data: Record<string, unknown>): void {
    const message = JSON.stringify({ type, ...data, timestamp: new Date().toISOString() });
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          logger.warn('WebSocket send error', { message: (error as Error).message });
          this.clients.delete(client);
        }
      }
    });
  }

  broadcastNewOrder(order: unknown): void {
    this.broadcastOrderUpdate('order_created', { order });
  }

  broadcastOrderStatusUpdate(order: unknown): void {
    this.broadcastOrderUpdate('order_updated', { order });
  }

  broadcastOrderDeletion(orderId: unknown): void {
    this.broadcastOrderUpdate('order_deleted', { orderId });
  }

  getConnectedClientsCount(): number {
    return this.clients.size;
  }
}
