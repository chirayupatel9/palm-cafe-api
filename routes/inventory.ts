import { Application, Request, Response } from 'express';
import Inventory from '../models/inventory';
import { upload } from '../config/multer';
import { auth } from '../middleware/auth';
import { requireFeature, requireActiveSubscription } from '../middleware/subscriptionAuth';
import {
  getInventoryCafeId,
  requireInventoryCafeScope,
  parseInventoryId,
  validateQuantity,
  INVENTORY_LIMITS,
  validateInventoryStrings
} from './helpers';
import { uploadLimiter } from '../middleware/rateLimiter';
import logger from '../config/logger';

export default function registerInventory(app: Application): void {
  app.get(
    '/api/inventory',
    auth,
    requireActiveSubscription,
    requireFeature('inventory'),
    requireInventoryCafeScope,
    async (req: Request, res: Response) => {
      try {
        const cafeId = getInventoryCafeId(req);
        const inventory = await Inventory.getAll(cafeId);
        res.json(inventory);
      } catch (error) {
        logger.error('Error fetching inventory:', error as Error);
        res.status(500).json({ error: 'Failed to fetch inventory' });
      }
    }
  );

  app.post(
    '/api/inventory',
    auth,
    requireActiveSubscription,
    requireFeature('inventory'),
    requireInventoryCafeScope,
    async (req: Request, res: Response) => {
      try {
        const cafeId = getInventoryCafeId(req);
        if (!cafeId) {
          res.status(400).json({
            error: 'Unable to determine cafe. Please ensure you are logged in and belong to a cafe.'
          });
          return;
        }
        const {
          name,
          category,
          quantity,
          unit,
          cost_per_unit,
          supplier,
          reorder_level,
          description
        } = req.body as {
          name?: string;
          category?: string;
          quantity?: unknown;
          unit?: string;
          cost_per_unit?: number | string;
          supplier?: string;
          reorder_level?: number | string;
          description?: string;
        };

        if (!name || typeof name !== 'string' || !name.trim()) {
          res.status(400).json({ error: 'Name is required and must be non-empty' });
          return;
        }
        if (!category || typeof category !== 'string' || !category.trim()) {
          res.status(400).json({ error: 'Category is required and must be non-empty' });
          return;
        }
        if (!unit || typeof unit !== 'string' || !unit.trim()) {
          res.status(400).json({ error: 'Unit is required and must be non-empty' });
          return;
        }
        const qtyCheck = validateQuantity(quantity);
        if (!qtyCheck.valid) {
          res.status(400).json({ error: qtyCheck.error });
          return;
        }
        const costNum =
          cost_per_unit != null && cost_per_unit !== '' ? parseFloat(String(cost_per_unit)) : null;
        if (costNum !== null && (Number.isNaN(costNum) || costNum < 0)) {
          res.status(400).json({ error: 'Cost per unit must be a non-negative number' });
          return;
        }
        const reorderNum =
          reorder_level != null && reorder_level !== '' ? parseFloat(String(reorder_level)) : null;
        if (reorderNum !== null && (Number.isNaN(reorderNum) || reorderNum < 0)) {
          res.status(400).json({ error: 'Reorder level must be a non-negative number' });
          return;
        }
        const strCheck = validateInventoryStrings({
          name: name.trim(),
          category: category.trim(),
          unit: unit.trim(),
          supplier: supplier != null ? String(supplier).trim() : null
        });
        if (!strCheck.valid) {
          res.status(400).json({ error: strCheck.error });
          return;
        }

        const newItem = await Inventory.create(
          {
            name: name.trim(),
            category: category.trim(),
            quantity: qtyCheck.value!,
            unit: unit.trim(),
            cost_per_unit: costNum,
            supplier: supplier != null ? String(supplier).trim() || null : null,
            reorder_level: reorderNum,
            description: description != null ? String(description).trim() || null : null
          },
          cafeId
        );

        res.status(201).json(newItem);
      } catch (error) {
        logger.error('Error creating inventory item:', error as Error);
        res.status(500).json({ error: 'Failed to create inventory item' });
      }
    }
  );

  app.put(
    '/api/inventory/:id',
    auth,
    requireFeature('inventory'),
    requireInventoryCafeScope,
    async (req: Request, res: Response) => {
      try {
        const idResult = parseInventoryId(req.params.id);
        if (!idResult.valid) {
          res.status(idResult.status!).json({ error: idResult.error });
          return;
        }
        const cafeId = getInventoryCafeId(req);
        const {
          name,
          category,
          quantity,
          unit,
          cost_per_unit,
          supplier,
          reorder_level,
          description
        } = req.body as {
          name?: string;
          category?: string;
          quantity?: unknown;
          unit?: string;
          cost_per_unit?: number | string;
          supplier?: string;
          reorder_level?: number | string;
          description?: string;
        };

        if (!name || typeof name !== 'string' || !name.trim()) {
          res.status(400).json({ error: 'Name is required and must be non-empty' });
          return;
        }
        if (!category || typeof category !== 'string' || !category.trim()) {
          res.status(400).json({ error: 'Category is required and must be non-empty' });
          return;
        }
        if (!unit || typeof unit !== 'string' || !unit.trim()) {
          res.status(400).json({ error: 'Unit is required and must be non-empty' });
          return;
        }
        const qtyCheck = validateQuantity(quantity);
        if (!qtyCheck.valid) {
          res.status(400).json({ error: qtyCheck.error });
          return;
        }
        const costNum =
          cost_per_unit != null && cost_per_unit !== '' ? parseFloat(String(cost_per_unit)) : null;
        if (costNum !== null && (Number.isNaN(costNum) || costNum < 0)) {
          res.status(400).json({ error: 'Cost per unit must be a non-negative number' });
          return;
        }
        const reorderNum =
          reorder_level != null && reorder_level !== '' ? parseFloat(String(reorder_level)) : null;
        if (reorderNum !== null && (Number.isNaN(reorderNum) || reorderNum < 0)) {
          res.status(400).json({ error: 'Reorder level must be a non-negative number' });
          return;
        }
        const strCheck = validateInventoryStrings({
          name: name.trim(),
          category: category.trim(),
          unit: unit.trim(),
          supplier: supplier != null ? String(supplier).trim() : null
        });
        if (!strCheck.valid) {
          res.status(400).json({ error: strCheck.error });
          return;
        }

        const updatedItem = await Inventory.update(
          idResult.value!,
          {
            name: name.trim(),
            category: category.trim(),
            quantity: qtyCheck.value!,
            unit: unit.trim(),
            cost_per_unit: costNum,
            supplier: supplier != null ? String(supplier).trim() || null : null,
            reorder_level: reorderNum,
            description: description != null ? String(description).trim() || null : null
          },
          cafeId
        );

        res.json(updatedItem);
      } catch (error) {
        if ((error as Error).message === 'Inventory item not found') {
          res.status(404).json({ error: 'Inventory item not found' });
          return;
        }
        if ((error as Error).message === 'Invalid inventory item ID') {
          res.status(400).json({ error: (error as Error).message });
          return;
        }
        logger.error('Error updating inventory item:', error as Error);
        res.status(500).json({ error: 'Failed to update inventory item' });
      }
    }
  );

  app.delete(
    '/api/inventory/:id',
    auth,
    requireFeature('inventory'),
    requireInventoryCafeScope,
    async (req: Request, res: Response) => {
      try {
        const idResult = parseInventoryId(req.params.id);
        if (!idResult.valid) {
          res.status(idResult.status!).json({ error: idResult.error });
          return;
        }
        const cafeId = getInventoryCafeId(req);
        await Inventory.delete(idResult.value!, cafeId);
        res.json({ message: 'Inventory item deleted successfully' });
      } catch (error) {
        if ((error as Error).message === 'Inventory item not found') {
          res.status(404).json({ error: 'Inventory item not found' });
          return;
        }
        if ((error as Error).message === 'Invalid inventory item ID') {
          res.status(400).json({ error: (error as Error).message });
          return;
        }
        logger.error('Error deleting inventory item:', error as Error);
        res.status(500).json({ error: 'Failed to delete inventory item' });
      }
    }
  );

  app.get(
    '/api/inventory/categories',
    auth,
    requireFeature('inventory'),
    requireInventoryCafeScope,
    async (req: Request, res: Response) => {
      try {
        const cafeId = getInventoryCafeId(req);
        const categories = await Inventory.getCategories(cafeId);
        res.json(categories);
      } catch (error) {
        logger.error('Error fetching inventory categories:', error as Error);
        res.status(500).json({ error: 'Failed to fetch inventory categories' });
      }
    }
  );

  app.patch(
    '/api/inventory/:id/stock',
    auth,
    requireFeature('inventory'),
    requireInventoryCafeScope,
    async (req: Request, res: Response) => {
      try {
        const idResult = parseInventoryId(req.params.id);
        if (!idResult.valid) {
          res.status(idResult.status!).json({ error: idResult.error });
          return;
        }
        const qtyCheck = validateQuantity(req.body.quantity);
        if (!qtyCheck.valid) {
          res.status(400).json({ error: qtyCheck.error || 'Valid quantity is required' });
          return;
        }
        const cafeId = getInventoryCafeId(req);
        await Inventory.updateStock(idResult.value!, qtyCheck.value!, cafeId);
        res.json({ message: 'Stock updated successfully' });
      } catch (error) {
        if ((error as Error).message === 'Inventory item not found') {
          res.status(404).json({ error: 'Inventory item not found' });
          return;
        }
        if (
          (error as Error).message === 'Invalid inventory item ID' ||
          (error as Error).message === 'Quantity must be a non-negative number'
        ) {
          res.status(400).json({ error: (error as Error).message });
          return;
        }
        logger.error('Error updating stock:', error as Error);
        res.status(500).json({ error: 'Failed to update stock' });
      }
    }
  );

  app.get(
    '/api/inventory/low-stock',
    auth,
    requireFeature('inventory'),
    requireInventoryCafeScope,
    async (req: Request, res: Response) => {
      try {
        const cafeId = getInventoryCafeId(req);
        const lowStockItems = await Inventory.getLowStockItems(cafeId);
        res.json(lowStockItems);
      } catch (error) {
        logger.error('Error fetching low stock items:', error as Error);
        res.status(500).json({ error: 'Failed to fetch low stock items' });
      }
    }
  );

  app.get(
    '/api/inventory/out-of-stock',
    auth,
    requireFeature('inventory'),
    requireInventoryCafeScope,
    async (req: Request, res: Response) => {
      try {
        const cafeId = getInventoryCafeId(req);
        const outOfStockItems = await Inventory.getOutOfStockItems(cafeId);
        res.json(outOfStockItems);
      } catch (error) {
        logger.error('Error fetching out of stock items:', error as Error);
        res.status(500).json({ error: 'Failed to fetch out of stock items' });
      }
    }
  );

  app.get(
    '/api/inventory/statistics',
    auth,
    requireFeature('inventory'),
    requireInventoryCafeScope,
    async (req: Request, res: Response) => {
      try {
        const cafeId = getInventoryCafeId(req);
        const statistics = await Inventory.getStatistics(cafeId);
        res.json(statistics);
      } catch (error) {
        logger.error('Error fetching inventory statistics:', error as Error);
        res.status(500).json({ error: 'Failed to fetch inventory statistics' });
      }
    }
  );

  app.get(
    '/api/inventory/export',
    auth,
    requireFeature('inventory'),
    requireInventoryCafeScope,
    async (req: Request, res: Response) => {
      try {
        const cafeId = getInventoryCafeId(req);
        const { buffer, filename } = await Inventory.exportToExcel(cafeId);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
      } catch (error) {
        logger.error('Error exporting inventory:', error as Error);
        res.status(500).json({ error: 'Failed to export inventory' });
      }
    }
  );

  app.get(
    '/api/inventory/template',
    auth,
    requireFeature('inventory'),
    async (_req: Request, res: Response) => {
      try {
        const { buffer, filename } = await Inventory.getImportTemplate();

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
      } catch (error) {
        logger.error('Error generating template:', error as Error);
        res.status(500).json({ error: 'Failed to generate template' });
      }
    }
  );

  app.post(
    '/api/inventory/import',
    auth,
    requireFeature('inventory'),
    requireInventoryCafeScope,
    uploadLimiter,
    upload.single('file'),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: 'No file uploaded' });
          return;
        }
        const cafeId = getInventoryCafeId(req);
        if (!cafeId) {
          res.status(400).json({
            error: 'Unable to determine cafe. Import is only available when logged in to a cafe.'
          });
          return;
        }

        const buffer = (req.file as Express.Multer.File & { buffer?: Buffer }).buffer ?? req.file.buffer;
        const results = await Inventory.importFromExcel(buffer, cafeId);

        res.json({
          message: 'Import completed',
          results: {
            total: results.total,
            successful: results.successful,
            failed: results.failed,
            errors: results.errors
          }
        });
      } catch (error) {
        logger.error('Error importing inventory:', error as Error);
        res.status(500).json({ error: 'Failed to import inventory' });
      }
    }
  );

  app.get(
    '/api/inventory/:id',
    auth,
    requireFeature('inventory'),
    requireInventoryCafeScope,
    async (req: Request, res: Response) => {
      try {
        const idResult = parseInventoryId(req.params.id);
        if (!idResult.valid) {
          res.status(idResult.status!).json({ error: idResult.error });
          return;
        }
        const cafeId = getInventoryCafeId(req);
        const item = await Inventory.getById(idResult.value!, cafeId);

        if (!item) {
          res.status(404).json({ error: 'Inventory item not found' });
          return;
        }

        res.json(item);
      } catch (error) {
        if ((error as Error).message === 'Invalid inventory item ID') {
          res.status(400).json({ error: (error as Error).message });
          return;
        }
        logger.error('Error fetching inventory item:', error as Error);
        res.status(500).json({ error: 'Failed to fetch inventory item' });
      }
    }
  );
}
