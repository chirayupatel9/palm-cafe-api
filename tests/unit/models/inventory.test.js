/**
 * Unit tests for Inventory model. DB mocked.
 */
const mockExecute = jest.fn();
const mockGetConnection = jest.fn();
jest.mock('../../../config/database', () => ({
  pool: {
    execute: (...args) => mockExecute(...args),
    getConnection: () => mockGetConnection()
  }
}));

jest.mock('xlsx', () => ({
  utils: {
    book_new: jest.fn().mockReturnValue({}),
    json_to_sheet: jest.fn().mockReturnValue({}),
    book_append_sheet: jest.fn(),
    sheet_to_json: jest.fn().mockReturnValue([])
  },
  write: jest.fn().mockReturnValue(Buffer.from('xlsx')),
  read: jest.fn().mockReturnValue({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } })
}));

const Inventory = require('../../../models/inventory');

describe('Inventory model', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockGetConnection.mockReset();
  });

  describe('getAll', () => {
    it('returns items with parsed numbers when cafeId provided', async () => {
      mockExecute.mockResolvedValue([[
        { id: 1, name: 'Coffee', category: 'Beverages', quantity: 10, unit: 'kg', cost_per_unit: 5.5, reorder_level: 2 }
      ]]);
      const result = await Inventory.getAll(1);
      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(10);
      expect(result[0].cost_per_unit).toBe(5.5);
    });
    it('returns items without where when cafeId null', async () => {
      mockExecute.mockResolvedValue([[]]);
      const result = await Inventory.getAll(null);
      expect(result).toEqual([]);
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('FROM inventory'), []);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      await expect(Inventory.getAll(1)).rejects.toThrow('Error fetching inventory');
    });
  });

  describe('getById', () => {
    it('throws for invalid id (non-integer)', async () => {
      await expect(Inventory.getById('abc')).rejects.toThrow('Invalid inventory item ID');
    });
    it('throws for invalid id (zero)', async () => {
      await expect(Inventory.getById(0)).rejects.toThrow('Invalid inventory item ID');
    });
    it('returns null when not found', async () => {
      mockExecute.mockResolvedValue([[]]);
      const result = await Inventory.getById(999, 1);
      expect(result).toBeNull();
    });
    it('returns item with parsed numbers when found', async () => {
      mockExecute.mockResolvedValue([[{
        id: 1,
        name: 'Beans',
        category: 'Dry',
        quantity: 50,
        unit: 'kg',
        cost_per_unit: 10,
        reorder_level: 5
      }]]);
      const result = await Inventory.getById(1, 1);
      expect(result.quantity).toBe(50);
      expect(result.cost_per_unit).toBe(10);
    });
    it('throws on DB error (catch branch)', async () => {
      mockExecute.mockRejectedValue(new Error('Connection lost'));
      await expect(Inventory.getById(1, 1)).rejects.toThrow('Error fetching inventory item');
    });
    it('rethrows Invalid inventory item ID from catch', async () => {
      await expect(Inventory.getById('x')).rejects.toThrow('Invalid inventory item ID');
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('inserts with cafe_id when provided', async () => {
      mockExecute.mockResolvedValue([{ insertId: 5 }]);
      const data = { name: 'New', category: 'Cat', quantity: 0, unit: 'kg' };
      const result = await Inventory.create(data, 1);
      expect(result).toHaveProperty('id', 5);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('cafe_id'),
        expect.any(Array)
      );
    });
    it('inserts without cafe_id when null', async () => {
      mockExecute.mockResolvedValue([{ insertId: 5 }]);
      await Inventory.create({ name: 'N', category: 'C', quantity: 0, unit: 'u' }, null);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO inventory'),
        expect.arrayContaining(['N', 'C', 0, 'u'])
      );
    });
    it('throws on DB error (duplicate or other)', async () => {
      mockExecute.mockRejectedValue(new Error('Duplicate entry'));
      await expect(Inventory.create({ name: 'N', category: 'C', quantity: 0, unit: 'u' }, 1))
        .rejects.toThrow('Error creating inventory item');
    });
  });

  describe('update', () => {
    it('throws for invalid id', async () => {
      await expect(Inventory.update('x', { name: 'N', category: 'C', quantity: 0, unit: 'u' }))
        .rejects.toThrow('Invalid inventory item ID');
    });
    it('returns updated payload when affectedRows 1', async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
      const data = { name: 'Updated', category: 'C', quantity: 5, unit: 'kg' };
      const result = await Inventory.update(1, data);
      expect(result).toMatchObject({ id: 1, name: 'Updated', category: 'C', quantity: 5, unit: 'kg' });
    });
    it('throws when item not found (affectedRows 0)', async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 0 }]);
      await expect(Inventory.update(999, { name: 'N', category: 'C', quantity: 0, unit: 'u' }, 1))
        .rejects.toThrow('Inventory item not found');
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      await expect(Inventory.update(1, { name: 'N', category: 'C', quantity: 0, unit: 'u' }))
        .rejects.toThrow('Error updating inventory item');
    });
  });

  describe('delete', () => {
    it('throws when DB layer errors (model uses undefined itemId in production)', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      await expect(Inventory.delete(1, 1)).rejects.toThrow('Error deleting inventory item');
    });
    it('wraps generic errors in catch', async () => {
      await expect(Inventory.delete(1, 1)).rejects.toThrow(/Error deleting inventory item/);
    });
  });

  describe('getCategories', () => {
    it('returns categories with cafeId', async () => {
      mockExecute.mockResolvedValue([[{ category: 'Beverages', item_count: 5 }]]);
      const result = await Inventory.getCategories(1);
      expect(result).toEqual([{ name: 'Beverages', item_count: 5 }]);
    });
    it('returns categories without cafeId', async () => {
      mockExecute.mockResolvedValue([[{ category: 'Dry', item_count: 3 }]]);
      const result = await Inventory.getCategories(null);
      expect(result).toHaveLength(1);
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('DISTINCT'), []);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      await expect(Inventory.getCategories(1)).rejects.toThrow('Error fetching inventory categories');
    });
  });

  describe('updateStock', () => {
    it('throws for invalid id', async () => {
      await expect(Inventory.updateStock('x', 10)).rejects.toThrow('Invalid inventory item ID');
    });
    it('throws for invalid quantity (negative)', async () => {
      await expect(Inventory.updateStock(1, -1)).rejects.toThrow('Quantity must be a non-negative number');
    });
    it('throws for invalid quantity (NaN)', async () => {
      await expect(Inventory.updateStock(1, 'abc')).rejects.toThrow('Quantity must be a non-negative number');
    });
    it('returns true when affectedRows 1', async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
      const result = await Inventory.updateStock(1, 25, 1);
      expect(result).toBe(true);
    });
    it('throws when item not found', async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 0 }]);
      await expect(Inventory.updateStock(999, 10, 1)).rejects.toThrow('Inventory item not found');
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      await expect(Inventory.updateStock(1, 10)).rejects.toThrow('Error updating stock');
    });
    it('rethrows quantity validation from catch', async () => {
      await expect(Inventory.updateStock(1, -5)).rejects.toThrow('Quantity must be a non-negative number');
    });
  });

  describe('getLowStockItems', () => {
    it('returns items when cafeId provided', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, name: 'Milk', quantity: 2, reorder_level: 5 }]]);
      const result = await Inventory.getLowStockItems(1);
      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(2);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      await expect(Inventory.getLowStockItems(1)).rejects.toThrow('Error fetching low stock items');
    });
  });

  describe('getOutOfStockItems', () => {
    it('returns items', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, name: 'Sugar', quantity: 0 }]]);
      const result = await Inventory.getOutOfStockItems(1);
      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(0);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      await expect(Inventory.getOutOfStockItems(1)).rejects.toThrow('Error fetching out of stock items');
    });
  });

  describe('getStatistics', () => {
    it('returns stats with cafeId', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ count: 10 }]])
        .mockResolvedValueOnce([[{ count: 2 }]])
        .mockResolvedValueOnce([[{ count: 1 }]])
        .mockResolvedValueOnce([[{ total_value: 150.5 }]]);
      const result = await Inventory.getStatistics(1);
      expect(result).toEqual({ totalItems: 10, lowStockItems: 2, outOfStockItems: 1, totalValue: 150.5 });
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      await expect(Inventory.getStatistics(1)).rejects.toThrow('Error fetching inventory statistics');
    });
  });

  describe('exportToExcel', () => {
    it('returns buffer and filename', async () => {
      mockExecute.mockResolvedValue([[]]);
      const result = await Inventory.exportToExcel(1);
      expect(result).toHaveProperty('buffer');
      expect(result).toHaveProperty('filename');
      expect(result.filename).toMatch(/inventory_export_.*\.xlsx/);
    });
    it('throws when getAll throws', async () => {
      mockExecute.mockRejectedValue(new Error('DB error'));
      await expect(Inventory.exportToExcel(1)).rejects.toThrow('Error exporting inventory to Excel');
    });
  });

  describe('getImportTemplate', () => {
    it('returns buffer and filename', async () => {
      const result = await Inventory.getImportTemplate();
      expect(result).toEqual({ buffer: expect.any(Buffer), filename: 'inventory_import_template.xlsx' });
    });
    it('throws on XLSX error', async () => {
      const XLSX = require('xlsx');
      XLSX.utils.book_new.mockImplementationOnce(() => { throw new Error('xlsx'); });
      await expect(Inventory.getImportTemplate()).rejects.toThrow('Error generating import template');
    });
  });

  describe('importFromExcel', () => {
    it('returns results with empty data', async () => {
      const conn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
        rollback: jest.fn().mockResolvedValue(undefined),
        execute: jest.fn()
      };
      mockGetConnection.mockResolvedValue(conn);
      const XLSX = require('xlsx');
      XLSX.read.mockReturnValue({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } });
      XLSX.utils.sheet_to_json.mockReturnValue([]);

      const result = await Inventory.importFromExcel(Buffer.from('x'), 1);
      expect(result).toEqual({ total: 0, successful: 0, failed: 0, errors: [] });
      expect(conn.commit).toHaveBeenCalled();
      expect(conn.release).toHaveBeenCalled();
    });
    it('validates required fields and records error', async () => {
      const conn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
        rollback: jest.fn().mockResolvedValue(undefined),
        execute: jest.fn()
      };
      mockGetConnection.mockResolvedValue(conn);
      const XLSX = require('xlsx');
      XLSX.utils.sheet_to_json.mockReturnValue([{ Name: '', Category: 'C', Unit: 'kg' }]);

      const result = await Inventory.importFromExcel(Buffer.from('x'), 1);
      expect(result.total).toBe(1);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toMatch(/Name, Category, and Unit are required/);
    });
    it('rejects when getConnection fails (before try block)', async () => {
      mockGetConnection.mockRejectedValue(new Error('No connection'));
      await expect(Inventory.importFromExcel(Buffer.from('x'), 1))
        .rejects.toThrow('No connection');
    });
  });
});
