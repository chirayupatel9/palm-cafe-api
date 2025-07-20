const { pool } = require('../config/database');

class Category {
  // Get all categories
  static async getAll() {
    try {
      const [rows] = await pool.execute(`
        SELECT id, name, description, sort_order, is_active, created_at, updated_at
        FROM categories 
        WHERE is_active = TRUE
        ORDER BY sort_order, name
      `);
      
      return rows.map(row => ({
        ...row,
        sort_order: parseInt(row.sort_order)
      }));
    } catch (error) {
      throw new Error(`Error fetching categories: ${error.message}`);
    }
  }

  // Get category by ID
  static async getById(id) {
    try {
      const [rows] = await pool.execute(
        'SELECT id, name, description, sort_order, is_active, created_at, updated_at FROM categories WHERE id = ?',
        [id]
      );
      
      if (rows.length === 0) {
        return null;
      }
      
      return {
        ...rows[0],
        sort_order: parseInt(rows[0].sort_order)
      };
    } catch (error) {
      throw new Error(`Error fetching category: ${error.message}`);
    }
  }

  // Create new category
  static async create(categoryData) {
    try {
      const { id, name, description, sort_order } = categoryData;
      
      const [result] = await pool.execute(
        'INSERT INTO categories (id, name, description, sort_order) VALUES (?, ?, ?, ?)',
        [id, name.trim(), description ? description.trim() : '', sort_order || 0]
      );
      
      return {
        id,
        name: name.trim(),
        description: description ? description.trim() : '',
        sort_order: sort_order || 0,
        is_active: true
      };
    } catch (error) {
      throw new Error(`Error creating category: ${error.message}`);
    }
  }

  // Update category
  static async update(id, categoryData) {
    try {
      const { name, description, sort_order, is_active } = categoryData;
      
      const [result] = await pool.execute(
        'UPDATE categories SET name = ?, description = ?, sort_order = ?, is_active = ? WHERE id = ?',
        [name.trim(), description ? description.trim() : '', sort_order || 0, is_active, id]
      );
      
      if (result.affectedRows === 0) {
        throw new Error('Category not found');
      }
      
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error updating category: ${error.message}`);
    }
  }

  // Delete category (soft delete)
  static async delete(id) {
    try {
      const [result] = await pool.execute(
        'UPDATE categories SET is_active = FALSE WHERE id = ?',
        [id]
      );
      
      if (result.affectedRows === 0) {
        throw new Error('Category not found');
      }
      
      return true;
    } catch (error) {
      throw new Error(`Error deleting category: ${error.message}`);
    }
  }

  // Get categories with menu item counts
  static async getWithItemCounts() {
    try {
      const [rows] = await pool.execute(`
        SELECT 
          c.id, 
          c.name, 
          c.description, 
          c.sort_order, 
          c.is_active,
          COUNT(m.id) as item_count
        FROM categories c
        LEFT JOIN menu_items m ON c.id = m.category_id AND m.is_active = TRUE
        WHERE c.is_active = TRUE
        GROUP BY c.id, c.name, c.description, c.sort_order, c.is_active
        ORDER BY c.sort_order, c.name
      `);
      
      return rows.map(row => ({
        ...row,
        sort_order: parseInt(row.sort_order),
        item_count: parseInt(row.item_count)
      }));
    } catch (error) {
      throw new Error(`Error fetching categories with item counts: ${error.message}`);
    }
  }
}

module.exports = Category; 