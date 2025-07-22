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
      const { name, description, sort_order } = categoryData;
      
      const [result] = await pool.execute(
        'INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)',
        [name.trim(), description ? description.trim() : '', sort_order || 0]
      );
      
      return {
        id: result.insertId,
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
        LEFT JOIN menu_items m ON c.id = m.category_id AND m.is_available = TRUE
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

  // Auto-generate categories from menu items
  static async generateFromMenuItems() {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Get all unique category names from menu items
      const [menuCategories] = await connection.execute(`
        SELECT DISTINCT 
          c.name as category_name,
          c.description as category_description,
          c.sort_order,
          COUNT(m.id) as item_count
        FROM menu_items m
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE m.is_available = TRUE
        GROUP BY c.name, c.description, c.sort_order
        ORDER BY c.sort_order, c.name
      `);

      // Get existing categories
      const [existingCategories] = await connection.execute(`
        SELECT id, name, is_active FROM categories
      `);
      const existingCategoryMap = {};
      existingCategories.forEach(cat => {
        existingCategoryMap[cat.name] = cat;
      });

      const generatedCategories = [];

      for (const menuCategory of menuCategories) {
        if (menuCategory.category_name) {
          const categoryName = menuCategory.category_name.trim();
          
          if (existingCategoryMap[categoryName]) {
            // Category exists, ensure it's active
            if (!existingCategoryMap[categoryName].is_active) {
              await connection.execute(
                'UPDATE categories SET is_active = TRUE WHERE id = ?',
                [existingCategoryMap[categoryName].id]
              );
            }
            generatedCategories.push({
              ...existingCategoryMap[categoryName],
              item_count: menuCategory.item_count
            });
          } else {
            // Create new category
            const [result] = await connection.execute(`
              INSERT INTO categories (name, description, sort_order, is_active) 
              VALUES (?, ?, ?, TRUE)
            `, [
              categoryName,
              menuCategory.category_description || '',
              menuCategory.sort_order || 0
            ]);
            
            generatedCategories.push({
              id: result.insertId,
              name: categoryName,
              description: menuCategory.category_description || '',
              sort_order: menuCategory.sort_order || 0,
              is_active: true,
              item_count: menuCategory.item_count
            });
          }
        }
      }

      // Deactivate categories that no longer have menu items
      const activeCategoryNames = menuCategories
        .filter(cat => cat.category_name)
        .map(cat => cat.category_name.trim());
      
      if (activeCategoryNames.length > 0) {
        await connection.execute(`
          UPDATE categories 
          SET is_active = FALSE 
          WHERE name NOT IN (${activeCategoryNames.map(() => '?').join(',')})
        `, activeCategoryNames);
      }

      await connection.commit();
      return generatedCategories;
    } catch (error) {
      await connection.rollback();
      throw new Error(`Error generating categories from menu items: ${error.message}`);
    } finally {
      connection.release();
    }
  }

  // Get auto-generated categories (categories that exist in menu items)
  static async getAutoGenerated() {
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
        INNER JOIN menu_items m ON c.id = m.category_id AND m.is_available = TRUE
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
      throw new Error(`Error fetching auto-generated categories: ${error.message}`);
    }
  }
}

module.exports = Category; 