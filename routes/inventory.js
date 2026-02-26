const path = require('path');
const Inventory = require('../models/inventory');
const { upload } = require('../config/multer');
const { auth } = require('../middleware/auth');
const { requireFeature, requireActiveSubscription } = require('../middleware/subscriptionAuth');
const { getInventoryCafeId, requireInventoryCafeScope, parseInventoryId, validateQuantity, INVENTORY_LIMITS, validateInventoryStrings } = require('./helpers');
const { uploadLimiter } = require('../middleware/rateLimiter');
const logger = require('../config/logger');

module.exports = function registerInventory(app) {
app.get('/api/inventory', auth, requireActiveSubscription, requireFeature('inventory'), requireInventoryCafeScope, async (req, res) => {
  try {
    const cafeId = getInventoryCafeId(req);
    const inventory = await Inventory.getAll(cafeId);
    res.json(inventory);
  } catch (error) {
    logger.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// Create new inventory item
app.post('/api/inventory', auth, requireActiveSubscription, requireFeature('inventory'), requireInventoryCafeScope, async (req, res) => {
  try {
    const cafeId = getInventoryCafeId(req);
    if (!cafeId) {
      return res.status(400).json({ error: 'Unable to determine cafe. Please ensure you are logged in and belong to a cafe.' });
    }
    const { name, category, quantity, unit, cost_per_unit, supplier, reorder_level, description } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required and must be non-empty' });
    }
    if (!category || typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({ error: 'Category is required and must be non-empty' });
    }
    if (!unit || typeof unit !== 'string' || !unit.trim()) {
      return res.status(400).json({ error: 'Unit is required and must be non-empty' });
    }
    const qtyCheck = validateQuantity(quantity);
    if (!qtyCheck.valid) {
      return res.status(400).json({ error: qtyCheck.error });
    }
    const costNum = cost_per_unit != null && cost_per_unit !== '' ? parseFloat(cost_per_unit) : null;
    if (costNum !== null && (Number.isNaN(costNum) || costNum < 0)) {
      return res.status(400).json({ error: 'Cost per unit must be a non-negative number' });
    }
    const reorderNum = reorder_level != null && reorder_level !== '' ? parseFloat(reorder_level) : null;
    if (reorderNum !== null && (Number.isNaN(reorderNum) || reorderNum < 0)) {
      return res.status(400).json({ error: 'Reorder level must be a non-negative number' });
    }
    const strCheck = validateInventoryStrings({
      name: name.trim(),
      category: category.trim(),
      unit: unit.trim(),
      supplier: supplier != null ? String(supplier).trim() : null
    });
    if (!strCheck.valid) {
      return res.status(400).json({ error: strCheck.error });
    }

    const newItem = await Inventory.create({
      name: name.trim(),
      category: category.trim(),
      quantity: qtyCheck.value,
      unit: unit.trim(),
      cost_per_unit: costNum,
      supplier: supplier != null ? String(supplier).trim() || null : null,
      reorder_level: reorderNum,
      description: description != null ? String(description).trim() || null : null
    }, cafeId);

    res.status(201).json(newItem);
  } catch (error) {
    logger.error('Error creating inventory item:', error);
    res.status(500).json({ error: 'Failed to create inventory item' });
  }
});

// Update inventory item
app.put('/api/inventory/:id', auth, requireFeature('inventory'), requireInventoryCafeScope, async (req, res) => {
  try {
    const idResult = parseInventoryId(req.params.id);
    if (!idResult.valid) {
      return res.status(idResult.status).json({ error: idResult.error });
    }
    const cafeId = getInventoryCafeId(req);
    const { name, category, quantity, unit, cost_per_unit, supplier, reorder_level, description } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required and must be non-empty' });
    }
    if (!category || typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({ error: 'Category is required and must be non-empty' });
    }
    if (!unit || typeof unit !== 'string' || !unit.trim()) {
      return res.status(400).json({ error: 'Unit is required and must be non-empty' });
    }
    const qtyCheck = validateQuantity(quantity);
    if (!qtyCheck.valid) {
      return res.status(400).json({ error: qtyCheck.error });
    }
    const costNum = cost_per_unit != null && cost_per_unit !== '' ? parseFloat(cost_per_unit) : null;
    if (costNum !== null && (Number.isNaN(costNum) || costNum < 0)) {
      return res.status(400).json({ error: 'Cost per unit must be a non-negative number' });
    }
    const reorderNum = reorder_level != null && reorder_level !== '' ? parseFloat(reorder_level) : null;
    if (reorderNum !== null && (Number.isNaN(reorderNum) || reorderNum < 0)) {
      return res.status(400).json({ error: 'Reorder level must be a non-negative number' });
    }
    const strCheck = validateInventoryStrings({
      name: name.trim(),
      category: category.trim(),
      unit: unit.trim(),
      supplier: supplier != null ? String(supplier).trim() : null
    });
    if (!strCheck.valid) {
      return res.status(400).json({ error: strCheck.error });
    }

    const updatedItem = await Inventory.update(idResult.value, {
      name: name.trim(),
      category: category.trim(),
      quantity: qtyCheck.value,
      unit: unit.trim(),
      cost_per_unit: costNum,
      supplier: supplier != null ? String(supplier).trim() || null : null,
      reorder_level: reorderNum,
      description: description != null ? String(description).trim() || null : null
    }, cafeId);

    res.json(updatedItem);
  } catch (error) {
    if (error.message === 'Inventory item not found') {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    if (error.message === 'Invalid inventory item ID') {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Error updating inventory item:', error);
    res.status(500).json({ error: 'Failed to update inventory item' });
  }
});

// Delete inventory item
app.delete('/api/inventory/:id', auth, requireFeature('inventory'), requireInventoryCafeScope, async (req, res) => {
  try {
    const idResult = parseInventoryId(req.params.id);
    if (!idResult.valid) {
      return res.status(idResult.status).json({ error: idResult.error });
    }
    const cafeId = getInventoryCafeId(req);
    await Inventory.delete(idResult.value, cafeId);
    res.json({ message: 'Inventory item deleted successfully' });
  } catch (error) {
    if (error.message === 'Inventory item not found') {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    if (error.message === 'Invalid inventory item ID') {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Error deleting inventory item:', error);
    res.status(500).json({ error: 'Failed to delete inventory item' });
  }
});

// Get inventory categories
app.get('/api/inventory/categories', auth, requireFeature('inventory'), requireInventoryCafeScope, async (req, res) => {
  try {
    const cafeId = getInventoryCafeId(req);
    const categories = await Inventory.getCategories(cafeId);
    res.json(categories);
  } catch (error) {
    logger.error('Error fetching inventory categories:', error);
    res.status(500).json({ error: 'Failed to fetch inventory categories' });
  }
});

// Update stock quantity
app.patch('/api/inventory/:id/stock', auth, requireFeature('inventory'), requireInventoryCafeScope, async (req, res) => {
  try {
    const idResult = parseInventoryId(req.params.id);
    if (!idResult.valid) {
      return res.status(idResult.status).json({ error: idResult.error });
    }
    const qtyCheck = validateQuantity(req.body.quantity);
    if (!qtyCheck.valid) {
      return res.status(400).json({ error: qtyCheck.error || 'Valid quantity is required' });
    }
    const cafeId = getInventoryCafeId(req);
    await Inventory.updateStock(idResult.value, qtyCheck.value, cafeId);
    res.json({ message: 'Stock updated successfully' });
  } catch (error) {
    if (error.message === 'Inventory item not found') {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    if (error.message === 'Invalid inventory item ID' || error.message === 'Quantity must be a non-negative number') {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Error updating stock:', error);
    res.status(500).json({ error: 'Failed to update stock' });
  }
});

// Get low stock items
app.get('/api/inventory/low-stock', auth, requireFeature('inventory'), requireInventoryCafeScope, async (req, res) => {
  try {
    const cafeId = getInventoryCafeId(req);
    const lowStockItems = await Inventory.getLowStockItems(cafeId);
    res.json(lowStockItems);
  } catch (error) {
    logger.error('Error fetching low stock items:', error);
    res.status(500).json({ error: 'Failed to fetch low stock items' });
  }
});

// Get out of stock items
app.get('/api/inventory/out-of-stock', auth, requireFeature('inventory'), requireInventoryCafeScope, async (req, res) => {
  try {
    const cafeId = getInventoryCafeId(req);
    const outOfStockItems = await Inventory.getOutOfStockItems(cafeId);
    res.json(outOfStockItems);
  } catch (error) {
    logger.error('Error fetching out of stock items:', error);
    res.status(500).json({ error: 'Failed to fetch out of stock items' });
  }
});

// Get inventory statistics
app.get('/api/inventory/statistics', auth, requireFeature('inventory'), requireInventoryCafeScope, async (req, res) => {
  try {
    const cafeId = getInventoryCafeId(req);
    const statistics = await Inventory.getStatistics(cafeId);
    res.json(statistics);
  } catch (error) {
    logger.error('Error fetching inventory statistics:', error);
    res.status(500).json({ error: 'Failed to fetch inventory statistics' });
  }
});

// Export inventory to Excel
app.get('/api/inventory/export', auth, requireFeature('inventory'), requireInventoryCafeScope, async (req, res) => {
  try {
    const cafeId = getInventoryCafeId(req);
    const { buffer, filename } = await Inventory.exportToExcel(cafeId);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    logger.error('Error exporting inventory:', error);
    res.status(500).json({ error: 'Failed to export inventory' });
  }
});

// Get inventory import template
app.get('/api/inventory/template', auth, requireFeature('inventory'), async (req, res) => {
  try {
    const { buffer, filename } = await Inventory.getImportTemplate();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    logger.error('Error generating template:', error);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

// Import inventory from Excel
app.post('/api/inventory/import', auth, requireFeature('inventory'), requireInventoryCafeScope, uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const cafeId = getInventoryCafeId(req);
    if (!cafeId) {
      return res.status(400).json({ error: 'Unable to determine cafe. Import is only available when logged in to a cafe.' });
    }

    const results = await Inventory.importFromExcel(req.file.buffer, cafeId);

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
    logger.error('Error importing inventory:', error);
    res.status(500).json({ error: 'Failed to import inventory' });
  }
});





// Get inventory item by ID (must come after specific routes)
app.get('/api/inventory/:id', auth, requireFeature('inventory'), requireInventoryCafeScope, async (req, res) => {
  try {
    const idResult = parseInventoryId(req.params.id);
    if (!idResult.valid) {
      return res.status(idResult.status).json({ error: idResult.error });
    }
    const cafeId = getInventoryCafeId(req);
    const item = await Inventory.getById(idResult.value, cafeId);

    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    res.json(item);
  } catch (error) {
    if (error.message === 'Invalid inventory item ID') {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Error fetching inventory item:', error);
    res.status(500).json({ error: 'Failed to fetch inventory item' });
  }
});

// Generate thermal printer content
const generateThermalPrintContent = async (order) => {
  // Get cafe settings for dynamic content
  let cafeSettings = {
    cafe_name: 'Cafe'
  };
  try {
    const settings = await CafeSettings.getCurrent();
    if (settings) {
      cafeSettings = settings;
      // Ensure cafe_name has a fallback
      if (!cafeSettings.cafe_name) {
        cafeSettings.cafe_name = 'Cafe';
      }
    }
  } catch (error) {
    logger.error('Error fetching cafe settings for thermal print:', error);
  }

  const formatCurrency = (amount) => {
    return `₹${parseFloat(amount || 0).toFixed(2)}`;
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  let content = '';
  
  // Header
  const cafeName = cafeSettings.cafe_name || 'Cafe';
  content += '='.repeat(32) + '\n';
  content += `        ${cafeName.toUpperCase()}\n`;
  content += '='.repeat(32) + '\n';
  content += `Order #: ${order.order_number}\n`;
  content += `Date: ${formatDate(order.created_at)}\n`;
  content += `Time: ${formatTime(order.created_at)}\n`;
  content += '-'.repeat(32) + '\n';
  
  // Customer Info
  content += `Customer: ${order.customer_name || 'Walk-in Customer'}\n`;
  if (order.customer_phone && order.customer_phone.trim() !== '') {
    content += `Phone: ${order.customer_phone}\n`;
  }
  if (order.payment_method) {
    content += `Payment: ${order.payment_method.toUpperCase()}\n`;
  }
  content += '-'.repeat(32) + '\n';
  
  // Items
  content += 'ITEMS:\n';
  order.items.forEach(item => {
    content += `${item.quantity}x ${item.name}\n`;
    content += `    ${formatCurrency(item.price)} each\n`;
    content += `    ${formatCurrency(item.total)}\n`;
  });
  content += '-'.repeat(32) + '\n';
  
  // Totals
  content += `Subtotal: ${formatCurrency(order.total_amount)}\n`;
  if (order.tax_amount > 0) {
    content += `Tax: ${formatCurrency(order.tax_amount)}\n`;
  }
  if (order.tip_amount > 0) {
    content += `Tip: ${formatCurrency(order.tip_amount)}\n`;
  }
  content += `TOTAL: ${formatCurrency(order.final_amount)}\n`;
  content += '-'.repeat(32) + '\n';
  
  // Notes
  if (order.notes) {
    content += `NOTES: ${order.notes}\n`;
    content += '-'.repeat(32) + '\n';
  }
  
  // Footer
  content += 'Thank you for your order!\n';
  content += 'Please wait for your number\n';
  content += '='.repeat(32) + '\n';
  content += '\n\n\n\n\n'; // Extra spacing for thermal printer
  
  return content;
};
};
