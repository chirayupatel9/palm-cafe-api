const { pool } = require('../config/database');

class MenuItem {
  // Get all menu items with category information
  static async getAll() {
    try {
      const [rows] = await pool.execute(`
        SELECT 
          m.id,
          m.category_id,
          m.name,
          m.description,
          m.price,
          m.is_available,
          m.sort_order,
          m.created_at,
          m.updated_at,
          c.name as category_name
        FROM menu_items m
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE m.is_available = TRUE
        ORDER BY c.sort_order, m.sort_order, m.name
      `);
      
      return rows.map(row => ({
        ...row,
        price: parseFloat(row.price),
        sort_order: parseInt(row.sort_order)
      }));
    } catch (error) {
      throw new Error(`Error fetching menu items: ${error.message}`);
    }
  }

  // Get menu items grouped by category
  static async getGroupedByCategory() {
    try {
      const [rows] = await pool.execute(`
        SELECT 
          c.id as category_id,
          c.name as category_name,
          c.description as category_description,
          c.sort_order as category_sort_order,
          m.id,
          m.name,
          m.description,
          m.price,
          m.sort_order
        FROM categories c
        LEFT JOIN menu_items m ON c.id = m.category_id AND m.is_available = TRUE
        WHERE c.is_active = TRUE
        ORDER BY c.sort_order, m.sort_order, m.name
      `);
      
      const grouped = {};
      rows.forEach(row => {
        if (!grouped[row.category_id]) {
          grouped[row.category_id] = {
            id: row.category_id,
            name: row.category_name,
            description: row.category_description,
            sort_order: parseInt(row.category_sort_order),
            items: []
          };
        }
        
        if (row.id) { // Only add if there's a menu item
          grouped[row.category_id].items.push({
            id: row.id,
            name: row.name,
            description: row.description,
            price: parseFloat(row.price),
            sort_order: parseInt(row.sort_order)
          });
        }
      });
      
      return Object.values(grouped);
    } catch (error) {
      throw new Error(`Error fetching menu items grouped by category: ${error.message}`);
    }
  }

  // Get menu item by ID
  static async getById(id) {
    try {
      const [rows] = await pool.execute(`
        SELECT 
          m.id,
          m.category_id,
          m.name,
          m.description,
          m.price,
          m.is_available,
          m.sort_order,
          m.created_at,
          m.updated_at,
          c.name as category_name
        FROM menu_items m
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE m.id = ?
      `, [id]);
      
      if (rows.length === 0) {
        return null;
      }
      
      return {
        ...rows[0],
        price: parseFloat(rows[0].price),
        sort_order: parseInt(rows[0].sort_order)
      };
    } catch (error) {
      throw new Error(`Error fetching menu item: ${error.message}`);
    }
  }

  // Create new menu item
  static async create(menuItemData) {
    try {
      const { id, category_id, name, description, price, sort_order } = menuItemData;
      
      if (!category_id) {
        throw new Error('Category ID is required');
      }
      
      const [result] = await pool.execute(
        'INSERT INTO menu_items (id, category_id, name, description, price, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [id, category_id, name.trim(), description ? description.trim() : '', parseFloat(price), sort_order || 0]
      );
      
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error creating menu item: ${error.message}`);
    }
  }

  // Update menu item
  static async update(id, menuItemData) {
    try {
      const { category_id, name, description, price, sort_order, is_available } = menuItemData;
      
      if (!category_id) {
        throw new Error('Category ID is required');
      }
      
      const [result] = await pool.execute(
        'UPDATE menu_items SET category_id = ?, name = ?, description = ?, price = ?, sort_order = ?, is_available = ? WHERE id = ?',
        [category_id, name.trim(), description ? description.trim() : '', parseFloat(price), sort_order || 0, is_available, id]
      );
      
      if (result.affectedRows === 0) {
        throw new Error('Menu item not found');
      }
      
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error updating menu item: ${error.message}`);
    }
  }

  // Delete menu item (soft delete)
  static async delete(id) {
    try {
      const [result] = await pool.execute(
        'UPDATE menu_items SET is_available = FALSE WHERE id = ?',
        [id]
      );
      
      if (result.affectedRows === 0) {
        throw new Error('Menu item not found');
      }
      
      return true;
    } catch (error) {
      throw new Error(`Error deleting menu item: ${error.message}`);
    }
  }

  // Get menu items by category
  static async getByCategory(categoryId) {
    try {
      const [rows] = await pool.execute(`
        SELECT 
          m.id,
          m.category_id,
          m.name,
          m.description,
          m.price,
          m.is_available,
          m.sort_order,
          m.created_at,
          m.updated_at,
          c.name as category_name
        FROM menu_items m
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE m.category_id = ? AND m.is_available = TRUE
        ORDER BY m.sort_order, m.name
      `, [categoryId]);
      
      return rows.map(row => ({
        ...row,
        price: parseFloat(row.price),
        sort_order: parseInt(row.sort_order)
      }));
    } catch (error) {
      throw new Error(`Error fetching menu items by category: ${error.message}`);
    }
  }

  // Bulk import menu items
  static async bulkImport(items) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      
      const results = [];
      for (const item of items) {
        try {
          const result = await this.create(item);
          results.push({ success: true, item: result });
        } catch (error) {
          results.push({ success: false, item, error: error.message });
        }
      }
      
      await connection.commit();
      return results;
    } catch (error) {
      await connection.rollback();
      throw new Error(`Error during bulk import: ${error.message}`);
    } finally {
      connection.release();
    }
  }
}

module.exports = MenuItem; 