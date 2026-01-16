const { pool } = require('../config/database');

class Category {
  // Get all categories (optionally filtered by cafe_id)
  static async getAll(cafeId = null) {
    try {
      // Check if cafe_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'categories' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = columns.length > 0;
      
      let whereClause = 'WHERE is_active = TRUE';
      const params = [];
      
      if (hasCafeId && cafeId) {
        whereClause += ' AND cafe_id = ?';
        params.push(cafeId);
      } else if (hasCafeId && !cafeId) {
        // If cafe_id column exists but no cafeId provided, return empty array
        return [];
      }
      
      const [rows] = await pool.execute(`
        SELECT id, name, description, sort_order, is_active, created_at, updated_at
        FROM categories 
        ${whereClause}
        ORDER BY sort_order, name
      `, params);
      
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
      // Check if cafe_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'categories' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = columns.length > 0;
      
      const { name, description, sort_order, cafe_id } = categoryData;
      
      if (hasCafeId && !cafe_id) {
        throw new Error('cafe_id is required when creating a category');
      }
      
      let query, params;
      
      if (hasCafeId) {
        query = 'INSERT INTO categories (name, description, sort_order, cafe_id) VALUES (?, ?, ?, ?)';
        params = [name.trim(), description ? description.trim() : '', sort_order || 0, cafe_id];
      } else {
        query = 'INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)';
        params = [name.trim(), description ? description.trim() : '', sort_order || 0];
      }
      
      const [result] = await pool.execute(query, params);
      
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

  // Update category (optionally verify cafe_id)
  static async update(id, categoryData, cafeId = null) {
    try {
      // Check if cafe_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'categories' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = columns.length > 0;
      
      // If cafe_id exists and cafeId is provided, verify the category belongs to this cafe
      if (hasCafeId && cafeId) {
        const [existing] = await pool.execute(
          'SELECT cafe_id FROM categories WHERE id = ?',
          [id]
        );
        
        if (existing.length === 0) {
          throw new Error('Category not found');
        }
        
        if (existing[0].cafe_id !== cafeId) {
          throw new Error('Category does not belong to this cafe');
        }
      }
      
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

  // Delete category (soft delete, optionally verify cafe_id)
  static async delete(id, cafeId = null) {
    try {
      // Check if cafe_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'categories' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = columns.length > 0;
      
      // If cafe_id exists and cafeId is provided, verify the category belongs to this cafe
      if (hasCafeId && cafeId) {
        const [existing] = await pool.execute(
          'SELECT cafe_id FROM categories WHERE id = ?',
          [id]
        );
        
        if (existing.length === 0) {
          throw new Error('Category not found');
        }
        
        if (existing[0].cafe_id !== cafeId) {
          throw new Error('Category does not belong to this cafe');
        }
      }
      
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

  // Get categories with menu item counts (optionally filtered by cafe_id)
  static async getWithItemCounts(cafeId = null) {
    try {
      // Check if cafe_id column exists
      const [categoryColumns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'categories' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const [menuColumns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'menu_items' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = categoryColumns.length > 0 && menuColumns.length > 0;
      
      let whereClause = 'WHERE c.is_active = TRUE';
      const params = [];
      
      let joinClause = 'LEFT JOIN menu_items m ON c.id = m.category_id AND m.is_available = TRUE';
      
      if (hasCafeId && cafeId) {
        whereClause += ' AND c.cafe_id = ?';
        joinClause += ' AND m.cafe_id = ?';
        params.push(cafeId, cafeId);
      } else if (hasCafeId && !cafeId) {
        return [];
      }
      
      const [rows] = await pool.execute(`
        SELECT 
          c.id, 
          c.name, 
          c.description, 
          c.sort_order, 
          c.is_active,
          COUNT(m.id) as item_count
        FROM categories c
        ${joinClause}
        ${whereClause}
        GROUP BY c.id, c.name, c.description, c.sort_order, c.is_active
        ORDER BY c.sort_order, c.name
      `, params);
      
      return rows.map(row => ({
        ...row,
        sort_order: parseInt(row.sort_order),
        item_count: parseInt(row.item_count)
      }));
    } catch (error) {
      throw new Error(`Error fetching categories with item counts: ${error.message}`);
    }
  }

  // Auto-generate categories from menu items (optionally filtered by cafe_id)
  static async generateFromMenuItems(cafeId = null) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check if cafe_id columns exist
      const [menuColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'menu_items' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const [categoryColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'categories' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = menuColumns.length > 0 && categoryColumns.length > 0;
      
      let whereClause = 'WHERE m.is_available = TRUE';
      const params = [];
      
      if (hasCafeId && cafeId) {
        whereClause += ' AND m.cafe_id = ?';
        params.push(cafeId);
      } else if (hasCafeId && !cafeId) {
        throw new Error('cafeId is required when cafe_id column exists');
      }

      // Get all unique category names from menu items
      const [menuCategories] = await connection.execute(`
        SELECT DISTINCT 
          c.name as category_name,
          c.description as category_description,
          c.sort_order,
          COUNT(m.id) as item_count
        FROM menu_items m
        LEFT JOIN categories c ON m.category_id = c.id
        ${whereClause}
        GROUP BY c.name, c.description, c.sort_order
        ORDER BY c.sort_order, c.name
      `, params);

      // Get existing categories (scoped to cafe if applicable)
      let existingCategoriesQuery = 'SELECT id, name, is_active FROM categories';
      const existingParams = [];
      
      if (hasCafeId && cafeId) {
        existingCategoriesQuery += ' WHERE cafe_id = ?';
        existingParams.push(cafeId);
      }
      
      const [existingCategories] = await connection.execute(existingCategoriesQuery, existingParams);
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
            // Create new category (scoped to cafe if applicable)
            let insertQuery = 'INSERT INTO categories (name, description, sort_order, is_active';
            let insertValues = '(?, ?, ?, TRUE';
            const insertParams = [
              categoryName,
              menuCategory.category_description || '',
              menuCategory.sort_order || 0
            ];
            
            if (hasCafeId && cafeId) {
              insertQuery += ', cafe_id) VALUES (?, ?, ?, TRUE, ?)';
              insertParams.push(cafeId);
            } else {
              insertQuery += ') VALUES (?, ?, ?, TRUE)';
            }
            
            const [result] = await connection.execute(insertQuery, insertParams);
            
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

      // Deactivate categories that no longer have menu items (scoped to cafe if applicable)
      const activeCategoryNames = menuCategories
        .filter(cat => cat.category_name)
        .map(cat => cat.category_name.trim());
      
      if (activeCategoryNames.length > 0) {
        let deactivateQuery = `
          UPDATE categories 
          SET is_active = FALSE 
          WHERE name NOT IN (${activeCategoryNames.map(() => '?').join(',')})
        `;
        const deactivateParams = [...activeCategoryNames];
        
        if (hasCafeId && cafeId) {
          deactivateQuery += ' AND cafe_id = ?';
          deactivateParams.push(cafeId);
        }
        
        await connection.execute(deactivateQuery, deactivateParams);
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

  // Get auto-generated categories (categories that exist in menu items, optionally filtered by cafe_id)
  static async getAutoGenerated(cafeId = null) {
    try {
      // Check if cafe_id columns exist
      const [categoryColumns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'categories' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const [menuColumns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'menu_items' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = categoryColumns.length > 0 && menuColumns.length > 0;
      
      let whereClause = 'WHERE c.is_active = TRUE';
      let joinClause = 'INNER JOIN menu_items m ON c.id = m.category_id AND m.is_available = TRUE';
      const params = [];
      
      if (hasCafeId && cafeId) {
        whereClause += ' AND c.cafe_id = ?';
        joinClause += ' AND m.cafe_id = ?';
        params.push(cafeId, cafeId);
      } else if (hasCafeId && !cafeId) {
        return [];
      }
      
      const [rows] = await pool.execute(`
        SELECT 
          c.id, 
          c.name, 
          c.description, 
          c.sort_order, 
          c.is_active,
          COUNT(m.id) as item_count
        FROM categories c
        ${joinClause}
        ${whereClause}
        GROUP BY c.id, c.name, c.description, c.sort_order, c.is_active
        ORDER BY c.sort_order, c.name
      `, params);
      
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