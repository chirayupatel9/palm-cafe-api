import { Application } from 'express';
import registerHealth from './health';
import registerAuth from './auth';
import registerSuperadmin from './superadmin';
import registerMenu from './menu';
import registerCafe from './cafe';
import registerInventory from './inventory';
import registerOrders from './orders';
import registerCustomers from './customers';
import registerMetrics from './metrics';
import registerPaymentMethods from './paymentMethods';

/**
 * Mount all API route modules on the Express app.
 * Route order: auth, superadmin, menu, cafe, inventory, orders, customers, health, metrics, paymentMethods.
 */
export default function registerRoutes(app: Application): void {
  registerAuth(app);
  registerSuperadmin(app);
  registerMenu(app);
  registerCafe(app);
  registerInventory(app);
  registerOrders(app);
  registerCustomers(app);
  registerHealth(app);
  registerMetrics(app);
  registerPaymentMethods(app);
  if (process.env.NODE_ENV === 'test') {
    app.get('/api/chaos/throw', () => {
      throw new Error('Chaos test');
    });
  }
}
