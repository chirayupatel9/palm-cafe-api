const { pool } = require('../config/database');
const XLSX = require('xlsx');

class Inventory {
  // Get all inventory items (optionally scoped by cafeId for multi-cafe)
  static async getAll(cafeId = null) {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute(
        `SELECT 
          id,
          name,
          category,
          quantity,
          unit,
          cost_per_unit,
          supplier,
          reorder_level,
          description,
          created_at,
          updated_at
        FROM inventory
        ${hasCafeId ? 'WHERE cafe_id = ?' : ''}
        ORDER BY name ASC`,
        hasCafeId ? [cafeId] : []
      );

      return rows.map(item => ({
        ...item,
        quantity: parseFloat(item.quantity),
        cost_per_unit: parseFloat(item.cost_per_unit),
        reorder_level: parseFloat(item.reorder_level)
      }));
    } catch (error) {
      throw new Error(`Error fetching inventory: ${error.message}`);
    }
  }

  // Get inventory item by ID (optionally scoped by cafeId for multi-cafe)
  static async getById(id, cafeId = null) {
    const itemId = parseInt(id, 10);
    if (!Number.isInteger(itemId) || itemId < 1) {
      throw new Error('Invalid inventory item ID');
    }
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute(
        `SELECT 
          id,
          name,
          category,
          quantity,
          unit,
          cost_per_unit,
          supplier,
          reorder_level,
          description,
          created_at,
          updated_at
        FROM inventory
        WHERE id = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
        hasCafeId ? [itemId, cafeId] : [itemId]
      );

      if (rows.length === 0) {
        return null;
      }

      const item = rows[0];
      return {
        ...item,
        quantity: parseFloat(item.quantity),
        cost_per_unit: parseFloat(item.cost_per_unit),
        reorder_level: parseFloat(item.reorder_level)
      };
    } catch (error) {
      if (error.message === 'Invalid inventory item ID') throw error;
      throw new Error(`Error fetching inventory item: ${error.message}`);
    }
  }

  // Create new inventory item (cafeId required for multi-cafe)
  static async create(inventoryData, cafeId = null) {
    try {
      const {
        name,
        category,
        quantity,
        unit,
        cost_per_unit,
        supplier,
        reorder_level,
        description
      } = inventoryData;

      const hasCafeId = cafeId != null;
      const [result] = await pool.execute(
        `INSERT INTO inventory (
          name, category, quantity, unit, cost_per_unit, 
          supplier, reorder_level, description${hasCafeId ? ', cafe_id' : ''}
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?${hasCafeId ? ', ?' : ''})`,
        hasCafeId
          ? [name, category, quantity, unit, cost_per_unit || null, supplier || null, reorder_level || null, description || null, cafeId]
          : [name, category, quantity, unit, cost_per_unit || null, supplier || null, reorder_level || null, description || null]
      );

      return { id: result.insertId, ...inventoryData };
    } catch (error) {
      throw new Error(`Error creating inventory item: ${error.message}`);
    }
  }

  // Update inventory item (optionally scoped by cafeId for multi-cafe)
  static async update(id, inventoryData, cafeId = null) {
    const itemId = parseInt(id, 10);
    if (!Number.isInteger(itemId) || itemId < 1) {
      throw new Error('Invalid inventory item ID');
    }
    try {
      const {
        name,
        category,
        quantity,
        unit,
        cost_per_unit,
        supplier,
        reorder_level,
        description
      } = inventoryData;

      const hasCafeId = cafeId != null;
      const [result] = await pool.execute(
        `UPDATE inventory SET
          name = ?,
          category = ?,
          quantity = ?,
          unit = ?,
          cost_per_unit = ?,
          supplier = ?,
          reorder_level = ?,
          description = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
        hasCafeId
          ? [name, category, quantity, unit, cost_per_unit || null, supplier || null, reorder_level || null, description || null, itemId, cafeId]
          : [name, category, quantity, unit, cost_per_unit || null, supplier || null, reorder_level || null, description || null, itemId]
      );

      if (result.affectedRows === 0) {
        throw new Error('Inventory item not found');
      }

      return { id, ...inventoryData };
    } catch (error) {
      throw new Error(`Error updating inventory item: ${error.message}`);
    }
  }

  // Delete inventory item (optionally scoped by cafeId for multi-cafe)
  static async delete(id, cafeId = null) {
    try {
      const hasCafeId = cafeId != null;
      const [result] = await pool.execute(
        `DELETE FROM inventory WHERE id = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
        hasCafeId ? [itemId, cafeId] : [itemId]
      );

      if (result.affectedRows === 0) {
        throw new Error('Inventory item not found');
      }

      return true;
    } catch (error) {
      if (error.message === 'Invalid inventory item ID') throw error;
      throw new Error(`Error deleting inventory item: ${error.message}`);
    }
  }

  // Get inventory categories (optionally scoped by cafeId for multi-cafe)
  static async getCategories(cafeId = null) {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute(
        `SELECT DISTINCT 
          category,
          COUNT(*) as item_count
        FROM inventory 
        WHERE category IS NOT NULL AND category != '' ${hasCafeId ? 'AND cafe_id = ?' : ''}
        GROUP BY category
        ORDER BY category ASC`,
        hasCafeId ? [cafeId] : []
      );

      return rows.map(row => ({
        name: row.category,
        item_count: parseInt(row.item_count)
      }));
    } catch (error) {
      throw new Error(`Error fetching inventory categories: ${error.message}`);
    }
  }

  // Update stock quantity (optionally scoped by cafeId for multi-cafe)
  static async updateStock(id, newQuantity, cafeId = null) {
    const itemId = parseInt(id, 10);
    if (!Number.isInteger(itemId) || itemId < 1) {
      throw new Error('Invalid inventory item ID');
    }
    const qty = Number(newQuantity);
    if (Number.isNaN(qty) || qty < 0) {
      throw new Error('Quantity must be a non-negative number');
    }
    try {
      const hasCafeId = cafeId != null;
      const [result] = await pool.execute(
        `UPDATE inventory 
        SET quantity = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
        hasCafeId ? [qty, itemId, cafeId] : [qty, itemId]
      );

      if (result.affectedRows === 0) {
        throw new Error('Inventory item not found');
      }

      return true;
    } catch (error) {
      if (error.message === 'Invalid inventory item ID' || error.message === 'Quantity must be a non-negative number') throw error;
      throw new Error(`Error updating stock: ${error.message}`);
    }
  }

  // Get low stock items (optionally scoped by cafeId for multi-cafe)
  static async getLowStockItems(cafeId = null) {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute(
        `SELECT 
          id, name, category, quantity, unit, reorder_level
        FROM inventory
        WHERE quantity <= reorder_level AND reorder_level > 0 ${hasCafeId ? 'AND cafe_id = ?' : ''}
        ORDER BY quantity ASC`,
        hasCafeId ? [cafeId] : []
      );

      return rows.map(item => ({
        ...item,
        quantity: parseFloat(item.quantity),
        reorder_level: parseFloat(item.reorder_level)
      }));
    } catch (error) {
      throw new Error(`Error fetching low stock items: ${error.message}`);
    }
  }

  // Get out of stock items (optionally scoped by cafeId for multi-cafe)
  static async getOutOfStockItems(cafeId = null) {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute(
        `SELECT 
          id, name, category, quantity, unit
        FROM inventory
        WHERE quantity <= 0 ${hasCafeId ? 'AND cafe_id = ?' : ''}
        ORDER BY name ASC`,
        hasCafeId ? [cafeId] : []
      );

      return rows.map(item => ({
        ...item,
        quantity: parseFloat(item.quantity)
      }));
    } catch (error) {
      throw new Error(`Error fetching out of stock items: ${error.message}`);
    }
  }

  // Get inventory statistics (optionally scoped by cafeId for multi-cafe)
  static async getStatistics(cafeId = null) {
    try {
      const hasCafeId = cafeId != null;
      const whereClause = hasCafeId ? ' WHERE cafe_id = ?' : '';
      const params = hasCafeId ? [cafeId] : [];

      const [totalItems] = await pool.execute(`SELECT COUNT(*) as count FROM inventory${whereClause}`, params);
      const [lowStockItems] = await pool.execute(
        `SELECT COUNT(*) as count 
        FROM inventory 
        WHERE quantity <= reorder_level AND reorder_level > 0${hasCafeId ? ' AND cafe_id = ?' : ''}`,
        params
      );
      const [outOfStockItems] = await pool.execute(
        `SELECT COUNT(*) as count 
        FROM inventory 
        WHERE quantity <= 0${hasCafeId ? ' AND cafe_id = ?' : ''}`,
        params
      );
      const [totalValue] = await pool.execute(
        `SELECT COALESCE(SUM(quantity * COALESCE(cost_per_unit, 0)), 0) as total_value 
        FROM inventory${whereClause}`,
        params
      );

      return {
        totalItems: totalItems[0].count,
        lowStockItems: lowStockItems[0].count,
        outOfStockItems: outOfStockItems[0].count,
        totalValue: parseFloat(totalValue[0].total_value) || 0
      };
    } catch (error) {
      throw new Error(`Error fetching inventory statistics: ${error.message}`);
    }
  }

  // Export inventory to Excel (optionally scoped by cafeId for multi-cafe)
  static async exportToExcel(cafeId = null) {
    try {
      const inventory = await this.getAll(cafeId);
      
      // Transform data for Excel
      const excelData = inventory.map(item => ({
        'ID': item.id,
        'Name': item.name,
        'Category': item.category,
        'Quantity': item.quantity,
        'Unit': item.unit,
        'Cost per Unit': item.cost_per_unit || 0,
        'Total Value': (item.quantity * (item.cost_per_unit || 0)).toFixed(2),
        'Supplier': item.supplier || '',
        'Reorder Level': item.reorder_level || 0,
        'Description': item.description || '',
        'Created At': new Date(item.created_at).toLocaleDateString(),
        'Updated At': new Date(item.updated_at).toLocaleDateString()
      }));

      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(excelData);

      // Set column widths
      const columnWidths = [
        { wch: 5 },   // ID
        { wch: 25 },  // Name
        { wch: 15 },  // Category
        { wch: 10 },  // Quantity
        { wch: 8 },   // Unit
        { wch: 12 },  // Cost per Unit
        { wch: 12 },  // Total Value
        { wch: 20 },  // Supplier
        { wch: 12 },  // Reorder Level
        { wch: 30 },  // Description
        { wch: 12 },  // Created At
        { wch: 12 }   // Updated At
      ];
      worksheet['!cols'] = columnWidths;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory');

      // Generate buffer
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      return {
        buffer,
        filename: `inventory_export_${new Date().toISOString().split('T')[0]}.xlsx`
      };
    } catch (error) {
      throw new Error(`Error exporting inventory to Excel: ${error.message}`);
    }
  }

  // Import inventory from Excel (cafeId required for multi-cafe; imported items belong to this cafe)
  static async importFromExcel(fileBuffer, cafeId = null) {
    const connection = await pool.getConnection();
    const hasCafeId = cafeId != null;

    try {
      await connection.beginTransaction();

      // Parse Excel file
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(worksheet);

      const results = {
        total: data.length,
        successful: 0,
        failed: 0,
        errors: []
      };

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNumber = i + 2; // +2 because Excel is 1-indexed and we have headers

        try {
          // Validate required fields
          if (!row.Name || !row.Category || !row.Unit) {
            throw new Error('Name, Category, and Unit are required');
          }

          // Parse numeric values
          const quantity = parseFloat(row.Quantity) || 0;
          const costPerUnit = parseFloat(row['Cost per Unit']) || null;
          const reorderLevel = parseFloat(row['Reorder Level']) || null;

          // Check if item already exists (by name and category, and cafe when multi-cafe)
          const [existing] = await connection.execute(
            `SELECT id FROM inventory WHERE name = ? AND category = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
            hasCafeId ? [row.Name.trim(), row.Category.trim(), cafeId] : [row.Name.trim(), row.Category.trim()]
          );

          if (existing.length > 0) {
            // Update existing item (already scoped by cafe when hasCafeId)
            await connection.execute(`
              UPDATE inventory SET
                quantity = ?,
                unit = ?,
                cost_per_unit = ?,
                supplier = ?,
                reorder_level = ?,
                description = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [
              quantity,
              row.Unit.trim(),
              costPerUnit,
              row.Supplier ? row.Supplier.trim() : null,
              reorderLevel,
              row.Description ? row.Description.trim() : null,
              existing[0].id
            ]);
          } else {
            // Create new item (set cafe_id when multi-cafe)
            await connection.execute(
              `INSERT INTO inventory (
                name, category, quantity, unit, cost_per_unit, 
                supplier, reorder_level, description${hasCafeId ? ', cafe_id' : ''}
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?${hasCafeId ? ', ?' : ''})`,
              hasCafeId
                ? [
                    row.Name.trim(),
                    row.Category.trim(),
                    quantity,
                    row.Unit.trim(),
                    costPerUnit,
                    row.Supplier ? row.Supplier.trim() : null,
                    reorderLevel,
                    row.Description ? row.Description.trim() : null,
                    cafeId
                  ]
                : [
                    row.Name.trim(),
                    row.Category.trim(),
                    quantity,
                    row.Unit.trim(),
                    costPerUnit,
                    row.Supplier ? row.Supplier.trim() : null,
                    reorderLevel,
                    row.Description ? row.Description.trim() : null
                  ]
            );
          }

          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            row: rowNumber,
            error: error.message,
            data: row
          });
        }
      }

      await connection.commit();
      return results;

    } catch (error) {
      await connection.rollback();
      throw new Error(`Error importing inventory from Excel: ${error.message}`);
    } finally {
      connection.release();
    }
  }

  // Get inventory template for import
  static async getImportTemplate() {
    try {
      // Create sample data for template
      const templateData = [
        {
          'Name': 'Coffee Beans',
          'Category': 'Beverages',
          'Quantity': 50,
          'Unit': 'kg',
          'Cost per Unit': 15.50,
          'Supplier': 'Coffee Supplier Co.',
          'Reorder Level': 10,
          'Description': 'Premium Arabica coffee beans'
        },
        {
          'Name': 'Milk',
          'Category': 'Dairy',
          'Quantity': 20,
          'Unit': 'L',
          'Cost per Unit': 2.50,
          'Supplier': 'Dairy Farm Ltd.',
          'Reorder Level': 5,
          'Description': 'Fresh whole milk'
        },
        {
          'Name': 'Sugar',
          'Category': 'Pantry',
          'Quantity': 15,
          'Unit': 'kg',
          'Cost per Unit': 1.20,
          'Supplier': 'Sweet Supplies',
          'Reorder Level': 3,
          'Description': 'Granulated white sugar'
        }
      ];

      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(templateData);

      // Set column widths
      const columnWidths = [
        { wch: 25 },  // Name
        { wch: 15 },  // Category
        { wch: 10 },  // Quantity
        { wch: 8 },   // Unit
        { wch: 12 },  // Cost per Unit
        { wch: 20 },  // Supplier
        { wch: 12 },  // Reorder Level
        { wch: 30 }   // Description
      ];
      worksheet['!cols'] = columnWidths;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory Template');

      // Generate buffer
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      return {
        buffer,
        filename: 'inventory_import_template.xlsx'
      };
    } catch (error) {
      throw new Error(`Error generating import template: ${error.message}`);
    }
  }
}

module.exports = Inventory; 