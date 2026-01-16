const { pool } = require('../config/database');

class MenuItem {
  // Get all menu items with category information (filtered by cafeId)
  // cafeId is optional for backward compatibility during migration
  static async getAll(cafeId = null) {
    try {
      // Check if cafe_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'menu_items' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = columns.length > 0;
      
      let query = `
        SELECT 
          m.id,
          m.category_id,
          m.name,
          m.description,
          m.price,
          m.is_available,
          m.sort_order,
          m.image_url,
          m.featured_priority,
          m.created_at,
          m.updated_at,
          c.name as category_name
        FROM menu_items m
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE m.is_available = TRUE
      `;
      
      const params = [];
      
      if (hasCafeId) {
        if (cafeId) {
          query += ' AND m.cafe_id = ?';
          params.push(cafeId);
        } else {
          // If cafe_id column exists but no cafeId provided, this is an error
          throw new Error('cafeId is required when cafe_id column exists');
        }
      }
      
      query += ' ORDER BY c.sort_order, m.sort_order, m.name';
      
      const [rows] = await pool.execute(query, params);
      
      return rows.map(row => ({
        ...row,
        price: parseFloat(row.price),
        sort_order: parseInt(row.sort_order),
        featured_priority: row.featured_priority ? parseInt(row.featured_priority) : null
      }));
    } catch (error) {
      throw new Error(`Error fetching menu items: ${error.message}`);
    }
  }

  // Get menu items grouped by category (filtered by cafeId)
  // cafeId is optional for backward compatibility during migration
  static async getGroupedByCategory(cafeId = null) {
    try {
      // Check if cafe_id column exists
      const [menuColumns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'menu_items' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const [categoryColumns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'categories' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = menuColumns.length > 0 && categoryColumns.length > 0;
      
      let query = `
        SELECT 
          c.id as category_id,
          c.name as category_name,
          c.description as category_description,
          c.sort_order as category_sort_order,
          m.id,
          m.name,
          m.description,
          m.price,
          m.sort_order,
          m.image_url
        FROM categories c
        LEFT JOIN menu_items m ON c.id = m.category_id AND m.is_available = TRUE
        WHERE c.is_active = TRUE
      `;
      
      const params = [];
      
      if (hasCafeId) {
        if (cafeId) {
          query += ' AND m.cafe_id = ? AND c.cafe_id = ?';
          params.push(cafeId, cafeId);
        } else {
          throw new Error('cafeId is required when cafe_id column exists');
        }
      }
      
      query += ' ORDER BY c.sort_order, m.sort_order, m.name';
      
      const [rows] = await pool.execute(query, params);
      
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
            sort_order: parseInt(row.sort_order),
            image_url: row.image_url
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
      // Check if featured_priority and cafe_id columns exist
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'menu_items' 
        AND COLUMN_NAME IN ('featured_priority', 'cafe_id')
      `);
      
      const hasFeaturedPriority = columns.some(col => col.COLUMN_NAME === 'featured_priority');
      const hasCafeId = columns.some(col => col.COLUMN_NAME === 'cafe_id');
      
      let query = `
        SELECT 
          m.id,
          m.category_id,
          m.name,
          m.description,
          m.price,
          m.is_available,
          m.sort_order,
          m.image_url,
          m.created_at,
          m.updated_at,
          c.name as category_name
      `;
      
      if (hasFeaturedPriority) {
        query += `, m.featured_priority`;
      }
      
      if (hasCafeId) {
        query += `, m.cafe_id`;
      }
      
      query += `
        FROM menu_items m
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE m.id = ?
      `;
      
      const [rows] = await pool.execute(query, [id]);
      
      if (rows.length === 0) {
        return null;
      }
      
      return {
        ...rows[0],
        price: parseFloat(rows[0].price),
        sort_order: parseInt(rows[0].sort_order),
        featured_priority: hasFeaturedPriority && rows[0].featured_priority ? parseInt(rows[0].featured_priority) : null
      };
    } catch (error) {
      throw new Error(`Error fetching menu item: ${error.message}`);
    }
  }

  // Create new menu item (cafe_id optional for backward compatibility)
  static async create(menuItemData) {
    try {
      const { category_id, name, description, price, sort_order, image_url, cafe_id } = menuItemData;
      
      if (!category_id) {
        throw new Error('Category ID is required');
      }

      // Check if cafe_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'menu_items' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = columns.length > 0;
      
      if (hasCafeId && !cafe_id) {
        throw new Error('Cafe ID is required when cafe_id column exists');
      }
      
      if (hasCafeId) {
        const [result] = await pool.execute(
          'INSERT INTO menu_items (category_id, name, description, price, sort_order, image_url, cafe_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [category_id, name.trim(), description ? description.trim() : '', parseFloat(price), sort_order || 0, image_url || null, cafe_id]
        );
        return await this.getById(result.insertId);
      } else {
        // Backward compatibility: insert without cafe_id
        const [result] = await pool.execute(
          'INSERT INTO menu_items (category_id, name, description, price, sort_order, image_url) VALUES (?, ?, ?, ?, ?, ?)',
          [category_id, name.trim(), description ? description.trim() : '', parseFloat(price), sort_order || 0, image_url || null]
        );
        return await this.getById(result.insertId);
      }
    } catch (error) {
      throw new Error(`Error creating menu item: ${error.message}`);
    }
  }

  // Update menu item
  static async update(id, menuItemData) {
    try {
      const { category_id, name, description, price, sort_order, is_available, image_url, featured_priority } = menuItemData;
      
      if (!category_id) {
        throw new Error('Category ID is required');
      }
      
      // Handle undefined values by converting them to null or default values
      const safeCategoryId = category_id || null;
      const safeName = name ? name.trim() : '';
      const safeDescription = description ? description.trim() : '';
      const safePrice = price ? parseFloat(price) : 0;
      const safeSortOrder = sort_order || 0;
      const safeIsAvailable = is_available !== undefined ? is_available : true;
      const safeImageUrl = image_url || null;
      const safeFeaturedPriority = featured_priority !== undefined && featured_priority !== null && featured_priority !== '' 
        ? parseInt(featured_priority) 
        : null;
      
      // Check if featured_priority column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'menu_items' 
        AND COLUMN_NAME = 'featured_priority'
      `);
      
      const hasFeaturedPriority = columns.length > 0;
      
      if (hasFeaturedPriority) {
        const [result] = await pool.execute(
          'UPDATE menu_items SET category_id = ?, name = ?, description = ?, price = ?, sort_order = ?, is_available = ?, image_url = ?, featured_priority = ? WHERE id = ?',
          [safeCategoryId, safeName, safeDescription, safePrice, safeSortOrder, safeIsAvailable, safeImageUrl, safeFeaturedPriority, id]
        );
        
        if (result.affectedRows === 0) {
          throw new Error('Menu item not found');
        }
      } else {
        const [result] = await pool.execute(
          'UPDATE menu_items SET category_id = ?, name = ?, description = ?, price = ?, sort_order = ?, is_available = ?, image_url = ? WHERE id = ?',
          [safeCategoryId, safeName, safeDescription, safePrice, safeSortOrder, safeIsAvailable, safeImageUrl, id]
        );
        
        if (result.affectedRows === 0) {
          throw new Error('Menu item not found');
        }
      }
      
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error updating menu item: ${error.message}`);
    }
  }

  // Delete menu item
  static async delete(id) {
    try {
      const [result] = await pool.execute('DELETE FROM menu_items WHERE id = ?', [id]);
      
      if (result.affectedRows === 0) {
        throw new Error('Menu item not found');
      }
      
      return { success: true };
    } catch (error) {
      throw new Error(`Error deleting menu item: ${error.message}`);
    }
  }

  // Get featured menu items (ordered by priority)
  static async getFeatured(cafeId = null, limit = 6) {
    try {
      // Check if featured_priority column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'menu_items' 
        AND COLUMN_NAME = 'featured_priority'
      `);
      
      const hasFeaturedPriority = columns.length > 0;
      const hasCafeId = await this.hasCafeIdColumn();
      
      if (!hasFeaturedPriority) {
        // If column doesn't exist, return empty array
        return [];
      }
      
      let query = `
        SELECT 
          m.id,
          m.category_id,
          m.name,
          m.description,
          m.price,
          m.is_available,
          m.sort_order,
          m.image_url,
          m.featured_priority,
          c.name as category_name
        FROM menu_items m
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE m.is_available = TRUE
        AND m.featured_priority IS NOT NULL
      `;
      
      const params = [];
      
      if (hasCafeId && cafeId) {
        query += ' AND m.cafe_id = ?';
        params.push(cafeId);
      }
      
      // LIMIT must be an integer, not a parameter (MySQL limitation)
      // limit is already validated as a positive integer by the caller
      const safeLimit = parseInt(limit, 10);
      query += ` ORDER BY m.featured_priority DESC, m.sort_order, m.name LIMIT ${safeLimit}`;
      
      const [rows] = await pool.execute(query, params);
      
      return rows.map(row => ({
        ...row,
        price: parseFloat(row.price),
        sort_order: parseInt(row.sort_order),
        featured_priority: parseInt(row.featured_priority)
      }));
    } catch (error) {
      throw new Error(`Error fetching featured menu items: ${error.message}`);
    }
  }

  // Helper to check if cafe_id column exists
  static async hasCafeIdColumn() {
    try {
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'menu_items' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      return columns.length > 0;
    } catch (error) {
      return false;
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
          m.image_url,
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
      
      // Check if cafe_id column exists
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'menu_items' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = columns.length > 0;
      
      const results = [];
      for (const item of items) {
        try {
          const { category_id, name, description, price, sort_order, image_url, cafe_id } = item;
          
          if (!category_id) {
            throw new Error('Category ID is required');
          }
          
          if (hasCafeId && !cafe_id) {
            throw new Error('Cafe ID is required when cafe_id column exists');
          }
          
          let query, params;
          
          if (hasCafeId) {
            query = 'INSERT INTO menu_items (category_id, name, description, price, sort_order, image_url, cafe_id) VALUES (?, ?, ?, ?, ?, ?, ?)';
            params = [
              category_id, 
              name.trim(), 
              description ? description.trim() : '', 
              parseFloat(price), 
              sort_order || 0, 
              image_url || null,
              cafe_id
            ];
          } else {
            query = 'INSERT INTO menu_items (category_id, name, description, price, sort_order, image_url) VALUES (?, ?, ?, ?, ?, ?)';
            params = [
              category_id, 
              name.trim(), 
              description ? description.trim() : '', 
              parseFloat(price), 
              sort_order || 0, 
              image_url || null
            ];
          }
          
          const [result] = await connection.execute(query, params);
          
          console.log('[BULK IMPORT] Item inserted successfully', {
            insertId: result.insertId,
            name: item.name,
            category_id: item.category_id,
            cafe_id: item.cafe_id
          });
          
          results.push({ success: true, item: { ...item, insertId: result.insertId } });
        } catch (error) {
          console.error('[BULK IMPORT] Failed to insert item', {
            name: item.name,
            category_id: item.category_id,
            cafe_id: item.cafe_id,
            error: error.message,
            stack: error.stack
          });
          results.push({ success: false, item, error: error.message });
        }
      }
      
      await connection.commit();
      console.log('[BULK IMPORT] Transaction committed', {
        totalItems: items.length,
        successCount: results.filter(r => r.success).length,
        failureCount: results.filter(r => !r.success).length
      });
      return results;
    } catch (error) {
      await connection.rollback();
      console.error('[BULK IMPORT] Transaction rolled back', {
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Error during bulk import: ${error.message}`);
    } finally {
      connection.release();
    }
  }
}

module.exports = MenuItem; 