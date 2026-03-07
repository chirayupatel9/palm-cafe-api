import { pool } from '../config/database';
import XLSX from 'xlsx';
import { RowDataPacket } from 'mysql2';

export interface InventoryRow {
  id: number;
  name: string;
  category: string | null;
  quantity: number;
  unit: string;
  cost_per_unit: number | null;
  supplier: string | null;
  reorder_level: number | null;
  description: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface InventoryCreateData {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  cost_per_unit?: number | null;
  supplier?: string | null;
  reorder_level?: number | null;
  description?: string | null;
}

class Inventory {
  static async getAll(cafeId: number | null = null): Promise<InventoryRow[]> {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, name, category, quantity, unit, cost_per_unit, supplier, reorder_level, description, created_at, updated_at
         FROM inventory ${hasCafeId ? 'WHERE cafe_id = ?' : ''} ORDER BY name ASC`,
        hasCafeId ? [cafeId] : []
      );
      return (rows as RowDataPacket[]).map((item: RowDataPacket) => ({
        ...item,
        quantity: parseFloat(String(item.quantity)),
        cost_per_unit: parseFloat(String(item.cost_per_unit)),
        reorder_level: parseFloat(String(item.reorder_level))
      })) as InventoryRow[];
    } catch (error) {
      throw new Error(`Error fetching inventory: ${(error as Error).message}`);
    }
  }

  static async getById(id: number, cafeId: number | null = null): Promise<InventoryRow | null> {
    const itemId = parseInt(String(id), 10);
    if (!Number.isInteger(itemId) || itemId < 1) {
      throw new Error('Invalid inventory item ID');
    }
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, name, category, quantity, unit, cost_per_unit, supplier, reorder_level, description, created_at, updated_at
         FROM inventory WHERE id = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
        hasCafeId ? [itemId, cafeId] : [itemId]
      );
      if (rows.length === 0) return null;
      const item = rows[0] as RowDataPacket;
      return {
        ...item,
        quantity: parseFloat(String(item.quantity)),
        cost_per_unit: parseFloat(String(item.cost_per_unit)),
        reorder_level: parseFloat(String(item.reorder_level))
      } as InventoryRow;
    } catch (error) {
      if ((error as Error).message === 'Invalid inventory item ID') throw error;
      throw new Error(`Error fetching inventory item: ${(error as Error).message}`);
    }
  }

  static async create(
    inventoryData: InventoryCreateData,
    cafeId: number | null = null
  ): Promise<InventoryRow & { id: number }> {
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
      const [result] = await pool.execute<RowDataPacket[] & { insertId: number }>(
        `INSERT INTO inventory (name, category, quantity, unit, cost_per_unit, supplier, reorder_level, description${hasCafeId ? ', cafe_id' : ''})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?${hasCafeId ? ', ?' : ''})`,
        hasCafeId
          ? [name, category, quantity, unit, cost_per_unit ?? null, supplier ?? null, reorder_level ?? null, description ?? null, cafeId]
          : [name, category, quantity, unit, cost_per_unit ?? null, supplier ?? null, reorder_level ?? null, description ?? null]
      );
      return { id: result.insertId, ...inventoryData } as InventoryRow & { id: number };
    } catch (error) {
      throw new Error(`Error creating inventory item: ${(error as Error).message}`);
    }
  }

  static async update(
    id: number,
    inventoryData: InventoryCreateData,
    cafeId: number | null = null
  ): Promise<InventoryRow & { id: number }> {
    const itemId = parseInt(String(id), 10);
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
      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(
        `UPDATE inventory SET name = ?, category = ?, quantity = ?, unit = ?, cost_per_unit = ?, supplier = ?, reorder_level = ?, description = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
        hasCafeId
          ? [name, category, quantity, unit, cost_per_unit ?? null, supplier ?? null, reorder_level ?? null, description ?? null, itemId, cafeId]
          : [name, category, quantity, unit, cost_per_unit ?? null, supplier ?? null, reorder_level ?? null, description ?? null, itemId]
      );
      if (result.affectedRows === 0) throw new Error('Inventory item not found');
      return { id: itemId, ...inventoryData } as InventoryRow & { id: number };
    } catch (error) {
      throw new Error(`Error updating inventory item: ${(error as Error).message}`);
    }
  }

  static async delete(id: number, cafeId: number | null = null): Promise<boolean> {
    const itemId = parseInt(String(id), 10);
    if (!Number.isInteger(itemId) || itemId < 1) {
      throw new Error('Invalid inventory item ID');
    }
    try {
      const hasCafeId = cafeId != null;
      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(
        `DELETE FROM inventory WHERE id = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
        hasCafeId ? [itemId, cafeId] : [itemId]
      );
      if (result.affectedRows === 0) throw new Error('Inventory item not found');
      return true;
    } catch (error) {
      if (
        (error as Error).message === 'Invalid inventory item ID' ||
        (error as Error).message === 'Quantity must be a non-negative number'
      )
        throw error;
      throw new Error(`Error deleting inventory item: ${(error as Error).message}`);
    }
  }

  static async getCategories(cafeId: number | null = null): Promise<{ name: string; item_count: number }[]> {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT DISTINCT category, COUNT(*) as item_count FROM inventory
         WHERE category IS NOT NULL AND category != '' ${hasCafeId ? 'AND cafe_id = ?' : ''}
         GROUP BY category ORDER BY category ASC`,
        hasCafeId ? [cafeId] : []
      );
      return (rows as RowDataPacket[]).map((row: RowDataPacket) => ({
        name: row.category as string,
        item_count: parseInt(String(row.item_count), 10)
      }));
    } catch (error) {
      throw new Error(`Error fetching inventory categories: ${(error as Error).message}`);
    }
  }

  static async updateStock(
    id: number,
    newQuantity: number,
    cafeId: number | null = null
  ): Promise<boolean> {
    const itemId = parseInt(String(id), 10);
    if (!Number.isInteger(itemId) || itemId < 1) {
      throw new Error('Invalid inventory item ID');
    }
    const qty = Number(newQuantity);
    if (Number.isNaN(qty) || qty < 0) {
      throw new Error('Quantity must be a non-negative number');
    }
    try {
      const hasCafeId = cafeId != null;
      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(
        `UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
        hasCafeId ? [qty, itemId, cafeId] : [qty, itemId]
      );
      if (result.affectedRows === 0) throw new Error('Inventory item not found');
      return true;
    } catch (error) {
      if (
        (error as Error).message === 'Invalid inventory item ID' ||
        (error as Error).message === 'Quantity must be a non-negative number'
      )
        throw error;
      throw new Error(`Error updating stock: ${(error as Error).message}`);
    }
  }

  static async getLowStockItems(cafeId: number | null = null): Promise<InventoryRow[]> {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, name, category, quantity, unit, reorder_level FROM inventory
         WHERE quantity <= reorder_level AND reorder_level > 0 ${hasCafeId ? 'AND cafe_id = ?' : ''}
         ORDER BY quantity ASC`,
        hasCafeId ? [cafeId] : []
      );
      return (rows as RowDataPacket[]).map((item: RowDataPacket) => ({
        ...item,
        quantity: parseFloat(String(item.quantity)),
        reorder_level: parseFloat(String(item.reorder_level))
      })) as InventoryRow[];
    } catch (error) {
      throw new Error(`Error fetching low stock items: ${(error as Error).message}`);
    }
  }

  static async getOutOfStockItems(cafeId: number | null = null): Promise<InventoryRow[]> {
    try {
      const hasCafeId = cafeId != null;
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, name, category, quantity, unit FROM inventory
         WHERE quantity <= 0 ${hasCafeId ? 'AND cafe_id = ?' : ''} ORDER BY name ASC`,
        hasCafeId ? [cafeId] : []
      );
      return (rows as RowDataPacket[]).map((item: RowDataPacket) => ({
        ...item,
        quantity: parseFloat(String(item.quantity))
      })) as InventoryRow[];
    } catch (error) {
      throw new Error(`Error fetching out of stock items: ${(error as Error).message}`);
    }
  }

  static async getStatistics(cafeId: number | null = null): Promise<{
    totalItems: number;
    lowStockItems: number;
    outOfStockItems: number;
    totalValue: number;
  }> {
    try {
      const hasCafeId = cafeId != null;
      const whereClause = hasCafeId ? ' WHERE cafe_id = ?' : '';
      const params = hasCafeId ? [cafeId] : [];

      const [totalItems] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM inventory${whereClause}`,
        params
      );
      const [lowStockItems] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM inventory WHERE quantity <= reorder_level AND reorder_level > 0${hasCafeId ? ' AND cafe_id = ?' : ''}`,
        params
      );
      const [outOfStockItems] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM inventory WHERE quantity <= 0${hasCafeId ? ' AND cafe_id = ?' : ''}`,
        params
      );
      const [totalValue] = await pool.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(quantity * COALESCE(cost_per_unit, 0)), 0) as total_value FROM inventory${whereClause}`,
        params
      );

      return {
        totalItems: (totalItems[0] as RowDataPacket).count as number,
        lowStockItems: (lowStockItems[0] as RowDataPacket).count as number,
        outOfStockItems: (outOfStockItems[0] as RowDataPacket).count as number,
        totalValue: parseFloat(String((totalValue[0] as RowDataPacket).total_value)) || 0
      };
    } catch (error) {
      throw new Error(`Error fetching inventory statistics: ${(error as Error).message}`);
    }
  }

  static async exportToExcel(cafeId: number | null = null): Promise<{ buffer: Buffer; filename: string }> {
    try {
      const inventory = await this.getAll(cafeId);
      const excelData = inventory.map((item) => ({
        ID: item.id,
        Name: item.name,
        Category: item.category,
        Quantity: item.quantity,
        Unit: item.unit,
        'Cost per Unit': item.cost_per_unit || 0,
        'Total Value': (item.quantity * (item.cost_per_unit || 0)).toFixed(2),
        Supplier: item.supplier || '',
        'Reorder Level': item.reorder_level || 0,
        Description: item.description || '',
        'Created At': new Date(item.created_at!).toLocaleDateString(),
        'Updated At': new Date(item.updated_at!).toLocaleDateString()
      }));

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const columnWidths = [
        { wch: 5 },
        { wch: 25 },
        { wch: 15 },
        { wch: 10 },
        { wch: 8 },
        { wch: 12 },
        { wch: 12 },
        { wch: 20 },
        { wch: 12 },
        { wch: 30 },
        { wch: 12 },
        { wch: 12 }
      ];
      worksheet['!cols'] = columnWidths;
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return {
        buffer,
        filename: `inventory_export_${new Date().toISOString().split('T')[0]}.xlsx`
      };
    } catch (error) {
      throw new Error(`Error exporting inventory to Excel: ${(error as Error).message}`);
    }
  }

  static async importFromExcel(
    fileBuffer: Buffer,
    cafeId: number | null = null
  ): Promise<{ total: number; successful: number; failed: number; errors: { row: number; error: string; data: unknown }[] }> {
    const connection = await pool.getConnection();
    const hasCafeId = cafeId != null;
    try {
      await connection.beginTransaction();
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(worksheet as XLSX.WorkSheet) as Record<string, unknown>[];

      const results = { total: data.length, successful: 0, failed: 0, errors: [] as { row: number; error: string; data: unknown }[] };

      for (let i = 0; i < data.length; i++) {
        const row = data[i] as Record<string, unknown>;
        const rowNumber = i + 2;
        try {
          if (!row.Name || !row.Category || !row.Unit) {
            throw new Error('Name, Category, and Unit are required');
          }
          const quantity = parseFloat(String(row.Quantity)) || 0;
          const costPerUnit = parseFloat(String(row['Cost per Unit'])) || null;
          const reorderLevel = parseFloat(String(row['Reorder Level'])) || null;

          const [existing] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM inventory WHERE name = ? AND category = ? ${hasCafeId ? 'AND cafe_id = ?' : ''}`,
            hasCafeId ? [String(row.Name).trim(), String(row.Category).trim(), cafeId] : [String(row.Name).trim(), String(row.Category).trim()]
          );

          if (existing.length > 0) {
            await connection.execute(
              `UPDATE inventory SET quantity = ?, unit = ?, cost_per_unit = ?, supplier = ?, reorder_level = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [
                quantity,
                String(row.Unit).trim(),
                costPerUnit,
                row.Supplier ? String(row.Supplier).trim() : null,
                reorderLevel,
                row.Description ? String(row.Description).trim() : null,
                (existing[0] as RowDataPacket).id
              ]
            );
          } else {
            await connection.execute(
              `INSERT INTO inventory (name, category, quantity, unit, cost_per_unit, supplier, reorder_level, description${hasCafeId ? ', cafe_id' : ''}) VALUES (?, ?, ?, ?, ?, ?, ?, ?${hasCafeId ? ', ?' : ''})`,
              hasCafeId
                ? [
                    String(row.Name).trim(),
                    String(row.Category).trim(),
                    quantity,
                    String(row.Unit).trim(),
                    costPerUnit,
                    row.Supplier ? String(row.Supplier).trim() : null,
                    reorderLevel,
                    row.Description ? String(row.Description).trim() : null,
                    cafeId
                  ]
                : [
                    String(row.Name).trim(),
                    String(row.Category).trim(),
                    quantity,
                    String(row.Unit).trim(),
                    costPerUnit,
                    row.Supplier ? String(row.Supplier).trim() : null,
                    reorderLevel,
                    row.Description ? String(row.Description).trim() : null
                  ]
            );
          }
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({ row: rowNumber, error: (error as Error).message, data: row });
        }
      }

      await connection.commit();
      return results;
    } catch (error) {
      await connection.rollback();
      throw new Error(`Error importing inventory from Excel: ${(error as Error).message}`);
    } finally {
      connection.release();
    }
  }

  static async getImportTemplate(): Promise<{ buffer: Buffer; filename: string }> {
    try {
      const templateData = [
        { Name: 'Coffee Beans', Category: 'Beverages', Quantity: 50, Unit: 'kg', 'Cost per Unit': 15.5, Supplier: 'Coffee Supplier Co.', 'Reorder Level': 10, Description: 'Premium Arabica coffee beans' },
        { Name: 'Milk', Category: 'Dairy', Quantity: 20, Unit: 'L', 'Cost per Unit': 2.5, Supplier: 'Dairy Farm Ltd.', 'Reorder Level': 5, Description: 'Fresh whole milk' },
        { Name: 'Sugar', Category: 'Pantry', Quantity: 15, Unit: 'kg', 'Cost per Unit': 1.2, Supplier: 'Sweet Supplies', 'Reorder Level': 3, Description: 'Granulated white sugar' },
        { Name: 'Flour', Category: 'Pantry', Quantity: 25, Unit: 'kg', 'Cost per Unit': 1.8, Supplier: 'Bakery Supplies', 'Reorder Level': 8, Description: 'All-purpose flour for baking' },
        { Name: 'Butter', Category: 'Dairy', Quantity: 10, Unit: 'kg', 'Cost per Unit': 8, Supplier: 'Dairy Farm Ltd.', 'Reorder Level': 4, Description: 'Unsalted butter for cooking and baking' }
      ];
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(templateData);
      worksheet['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory Template');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return { buffer, filename: 'inventory_import_template.xlsx' };
    } catch (error) {
      throw new Error(`Error generating import template: ${(error as Error).message}`);
    }
  }
}

export default Inventory;
