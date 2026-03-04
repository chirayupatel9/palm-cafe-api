import { pool } from '../config/database';
import logger from '../config/logger';
import { RowDataPacket } from 'mysql2';

export interface MenuItemRow {
  id: number;
  category_id: number;
  name: string;
  description: string;
  price: number;
  is_available: boolean;
  sort_order: number;
  image_url?: string | null;
  featured_priority?: number | null;
  created_at?: Date;
  updated_at?: Date;
  category_name?: string | null;
  cafe_id?: number | null;
}

export interface MenuItemCreateData {
  category_id: number;
  name: string;
  description?: string | null;
  price: number;
  sort_order?: number;
  image_url?: string | null;
  cafe_id?: number | null;
}

export interface MenuItemUpdateData {
  category_id: number;
  name?: string;
  description?: string | null;
  price?: number;
  sort_order?: number;
  is_available?: boolean;
  image_url?: string | null;
  featured_priority?: number | null;
}

export interface CategoryWithItems {
  id: number;
  name: string;
  description?: string | null;
  sort_order: number;
  items: { id: number; name: string; description?: string; price: number; sort_order: number; image_url?: string | null }[];
}

class MenuItem {
  static async getAll(cafeId: number | null = null): Promise<MenuItemRow[]> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;

      let query = `
        SELECT m.id, m.category_id, m.name, m.description, m.price, m.is_available, m.sort_order, m.image_url, m.featured_priority, m.created_at, m.updated_at, c.name as category_name
        FROM menu_items m
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE m.is_available = TRUE
      `;
      const params: number[] = [];
      if (hasCafeId) {
        if (cafeId) {
          query += ' AND m.cafe_id = ?';
          params.push(cafeId);
        } else {
          throw new Error('cafeId is required when cafe_id column exists');
        }
      }
      query += ' ORDER BY c.sort_order, m.sort_order, m.name';

      const [rows] = await pool.execute<RowDataPacket[]>(query, params);
      return (rows as RowDataPacket[]).map((row: RowDataPacket) => ({
        ...row,
        price: parseFloat(String(row.price)),
        sort_order: parseInt(String(row.sort_order), 10),
        featured_priority: row.featured_priority ? parseInt(String(row.featured_priority), 10) : null
      })) as MenuItemRow[];
    } catch (error) {
      throw new Error(`Error fetching menu items: ${(error as Error).message}`);
    }
  }

  static async getGroupedByCategory(cafeId: number | null = null): Promise<CategoryWithItems[]> {
    try {
      const [menuColumns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'cafe_id'
      `);
      const [categoryColumns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = menuColumns.length > 0 && categoryColumns.length > 0;

      let query = `
        SELECT c.id as category_id, c.name as category_name, c.description as category_description, c.sort_order as category_sort_order,
          m.id, m.name, m.description, m.price, m.sort_order, m.image_url
        FROM categories c
        LEFT JOIN menu_items m ON c.id = m.category_id AND m.is_available = TRUE
        WHERE c.is_active = TRUE
      `;
      const params: number[] = [];
      if (hasCafeId) {
        if (cafeId) {
          query += ' AND m.cafe_id = ? AND c.cafe_id = ?';
          params.push(cafeId, cafeId);
        } else {
          throw new Error('cafeId is required when cafe_id column exists');
        }
      }
      query += ' ORDER BY c.sort_order, m.sort_order, m.name';

      const [rows] = await pool.execute<RowDataPacket[]>(query, params);
      const grouped: Record<
        number,
        { id: number; name: string; description?: string; sort_order: number; items: CategoryWithItems['items'] }
      > = {};
      (rows as RowDataPacket[]).forEach((row: RowDataPacket) => {
        const cid = row.category_id as number;
        if (!grouped[cid]) {
          grouped[cid] = {
            id: cid,
            name: row.category_name as string,
            description: row.category_description as string,
            sort_order: parseInt(String(row.category_sort_order), 10),
            items: []
          };
        }
        if (row.id) {
          grouped[cid].items.push({
            id: row.id as number,
            name: row.name as string,
            description: row.description as string,
            price: parseFloat(String(row.price)),
            sort_order: parseInt(String(row.sort_order), 10),
            image_url: row.image_url as string | null
          });
        }
      });
      return Object.values(grouped);
    } catch (error) {
      throw new Error(`Error fetching menu items grouped by category: ${(error as Error).message}`);
    }
  }

  static async getById(id: number): Promise<MenuItemRow | null> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND COLUMN_NAME IN ('featured_priority', 'cafe_id')
      `);
      const colNames = (columns as RowDataPacket[]).map((c) => c.COLUMN_NAME as string);
      const hasFeaturedPriority = colNames.includes('featured_priority');
      const hasCafeId = colNames.includes('cafe_id');

      let query = `
        SELECT m.id, m.category_id, m.name, m.description, m.price, m.is_available, m.sort_order, m.image_url, m.created_at, m.updated_at, c.name as category_name
      `;
      if (hasFeaturedPriority) query += ', m.featured_priority';
      if (hasCafeId) query += ', m.cafe_id';
      query += ` FROM menu_items m LEFT JOIN categories c ON m.category_id = c.id WHERE m.id = ?`;

      const [rows] = await pool.execute<RowDataPacket[]>(query, [id]);
      if (rows.length === 0) return null;

      const r = rows[0] as RowDataPacket;
      return {
        ...r,
        price: parseFloat(String(r.price)),
        sort_order: parseInt(String(r.sort_order), 10),
        featured_priority:
          hasFeaturedPriority && r.featured_priority ? parseInt(String(r.featured_priority), 10) : null
      } as MenuItemRow;
    } catch (error) {
      throw new Error(`Error fetching menu item: ${(error as Error).message}`);
    }
  }

  static async create(menuItemData: MenuItemCreateData): Promise<MenuItemRow> {
    try {
      const { category_id, name, description, price, sort_order, image_url, cafe_id } = menuItemData;
      if (!category_id) throw new Error('Category ID is required');

      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;
      if (hasCafeId && !cafe_id) throw new Error('Cafe ID is required when cafe_id column exists');

      if (hasCafeId) {
        const [result] = await pool.execute<RowDataPacket[] & { insertId: number }>(
          'INSERT INTO menu_items (category_id, name, description, price, sort_order, image_url, cafe_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [category_id, name.trim(), description ? description.trim() : '', parseFloat(String(price)), sort_order || 0, image_url ?? null, cafe_id!]
        );
        const created = await this.getById(result.insertId);
        if (!created) throw new Error('Failed to fetch created menu item');
        return created;
      } else {
        const [result] = await pool.execute<RowDataPacket[] & { insertId: number }>(
          'INSERT INTO menu_items (category_id, name, description, price, sort_order, image_url) VALUES (?, ?, ?, ?, ?, ?)',
          [category_id, name.trim(), description ? description.trim() : '', parseFloat(String(price)), sort_order || 0, image_url ?? null]
        );
        const created = await this.getById(result.insertId);
        if (!created) throw new Error('Failed to fetch created menu item');
        return created;
      }
    } catch (error) {
      throw new Error(`Error creating menu item: ${(error as Error).message}`);
    }
  }

  static async update(
    id: number,
    menuItemData: MenuItemUpdateData,
    cafeId: number | null = null
  ): Promise<MenuItemRow> {
    try {
      const {
        category_id,
        name,
        description,
        price,
        sort_order,
        is_available,
        image_url,
        featured_priority
      } = menuItemData;
      if (!category_id) throw new Error('Category ID is required');

      const safeCategoryId = category_id ?? null;
      const safeName = name ? name.trim() : '';
      const safeDescription = description ? description.trim() : '';
      const safePrice = price ? parseFloat(String(price)) : 0;
      const safeSortOrder = sort_order ?? 0;
      const safeIsAvailable = is_available !== undefined ? is_available : true;
      const safeImageUrl = image_url ?? null;
      const safeFeaturedPriority =
        featured_priority !== undefined && featured_priority !== null
          ? parseInt(String(featured_priority), 10)
          : null;

      const [featuredCol] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'featured_priority'
      `);
      const hasFeaturedPriority = featuredCol.length > 0;

      const [cafeCol] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = cafeCol.length > 0;
      const scopeByCafe = hasCafeId && cafeId != null;

      const whereClause = scopeByCafe ? ' WHERE id = ? AND cafe_id = ?' : ' WHERE id = ?';
      const params: (number | string | boolean | null)[] = hasFeaturedPriority
        ? [safeCategoryId, safeName, safeDescription, safePrice, safeSortOrder, safeIsAvailable, safeImageUrl, safeFeaturedPriority, id]
        : [safeCategoryId, safeName, safeDescription, safePrice, safeSortOrder, safeIsAvailable, safeImageUrl, id];
      if (scopeByCafe) params.push(cafeId!);

      const setClause = hasFeaturedPriority
        ? 'UPDATE menu_items SET category_id = ?, name = ?, description = ?, price = ?, sort_order = ?, is_available = ?, image_url = ?, featured_priority = ?'
        : 'UPDATE menu_items SET category_id = ?, name = ?, description = ?, price = ?, sort_order = ?, is_available = ?, image_url = ?';

      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(
        setClause + whereClause,
        params
      );
      if (result.affectedRows === 0) throw new Error('Menu item not found');
      const updated = await this.getById(id);
      if (!updated) throw new Error('Menu item not found');
      return updated;
    } catch (error) {
      throw new Error(`Error updating menu item: ${(error as Error).message}`);
    }
  }

  static async delete(id: number, cafeId: number | null = null): Promise<{ success: boolean }> {
    try {
      let sql = 'DELETE FROM menu_items WHERE id = ?';
      const params: (number | null)[] = [id];
      if (cafeId != null) {
        const [cafeCol] = await pool.execute<RowDataPacket[]>(`
          SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'cafe_id'
        `);
        if (cafeCol.length > 0) {
          sql += ' AND cafe_id = ?';
          params.push(cafeId);
        }
      }
      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(sql, params);
      if (result.affectedRows === 0) throw new Error('Menu item not found');
      return { success: true };
    } catch (error) {
      throw new Error(`Error deleting menu item: ${(error as Error).message}`);
    }
  }

  static async getFeatured(cafeId: number | null = null, limit = 6): Promise<MenuItemRow[]> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'featured_priority'
      `);
      const hasFeaturedPriority = columns.length > 0;
      const hasCafeId = await this.hasCafeIdColumn();
      if (!hasFeaturedPriority) return [];

      let query = `
        SELECT m.id, m.category_id, m.name, m.description, m.price, m.is_available, m.sort_order, m.image_url, m.featured_priority, c.name as category_name
        FROM menu_items m
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE m.is_available = TRUE AND m.featured_priority IS NOT NULL
      `;
      const params: number[] = [];
      if (hasCafeId && cafeId) {
        query += ' AND m.cafe_id = ?';
        params.push(cafeId);
      }
      const safeLimit = parseInt(String(limit), 10);
      query += ` ORDER BY m.featured_priority DESC, m.sort_order, m.name LIMIT ${safeLimit}`;

      const [rows] = await pool.execute<RowDataPacket[]>(query, params);
      return (rows as RowDataPacket[]).map((row: RowDataPacket) => ({
        ...row,
        price: parseFloat(String(row.price)),
        sort_order: parseInt(String(row.sort_order), 10),
        featured_priority: parseInt(String(row.featured_priority), 10)
      })) as MenuItemRow[];
    } catch (error) {
      throw new Error(`Error fetching featured menu items: ${(error as Error).message}`);
    }
  }

  static async hasCafeIdColumn(): Promise<boolean> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'cafe_id'
      `);
      return columns.length > 0;
    } catch {
      return false;
    }
  }

  static async getByCategory(categoryId: number): Promise<MenuItemRow[]> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(`
        SELECT m.id, m.category_id, m.name, m.description, m.price, m.is_available, m.sort_order, m.image_url, m.created_at, m.updated_at, c.name as category_name
        FROM menu_items m
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE m.category_id = ? AND m.is_available = TRUE
        ORDER BY m.sort_order, m.name
      `, [categoryId]);
      return (rows as RowDataPacket[]).map((row: RowDataPacket) => ({
        ...row,
        price: parseFloat(String(row.price)),
        sort_order: parseInt(String(row.sort_order), 10)
      })) as MenuItemRow[];
    } catch (error) {
      throw new Error(`Error fetching menu items by category: ${(error as Error).message}`);
    }
  }

  static async bulkImport(
    items: (MenuItemCreateData & { name: string })[]
  ): Promise<{ success: boolean; item?: MenuItemCreateData & { insertId?: number }; error?: string }[]> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [columns] = await connection.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;
      const results: { success: boolean; item?: MenuItemCreateData & { insertId?: number }; error?: string }[] = [];

      for (const item of items) {
        try {
          const { category_id, name, description, price, sort_order, image_url, cafe_id } = item;
          if (!category_id) throw new Error('Category ID is required');
          if (hasCafeId && !cafe_id) throw new Error('Cafe ID is required when cafe_id column exists');

          let query: string;
          let params: (string | number | null)[];
          if (hasCafeId) {
            query =
              'INSERT INTO menu_items (category_id, name, description, price, sort_order, image_url, cafe_id) VALUES (?, ?, ?, ?, ?, ?, ?)';
            params = [
              category_id,
              name.trim(),
              description ? description.trim() : '',
              parseFloat(String(price)),
              sort_order || 0,
              image_url ?? null,
              cafe_id!
            ];
          } else {
            query =
              'INSERT INTO menu_items (category_id, name, description, price, sort_order, image_url) VALUES (?, ?, ?, ?, ?, ?)';
            params = [
              category_id,
              name.trim(),
              description ? description.trim() : '',
              parseFloat(String(price)),
              sort_order || 0,
              image_url ?? null
            ];
          }

          const [result] = await connection.execute<RowDataPacket[] & { insertId: number }>(
            query,
            params
          );
          logger.debug('Bulk import item inserted', {
            insertId: result.insertId,
            name: item.name,
            category_id: item.category_id,
            cafe_id: item.cafe_id
          });
          results.push({ success: true, item: { ...item, insertId: result.insertId } });
        } catch (error) {
          logger.error('Bulk import failed to insert item', {
            name: item.name,
            category_id: item.category_id,
            cafe_id: item.cafe_id,
            error: (error as Error).message,
            stack: (error as Error).stack
          });
          results.push({ success: false, item, error: (error as Error).message });
        }
      }

      await connection.commit();
      logger.debug('Bulk import transaction committed', {
        totalItems: items.length,
        successCount: results.filter((r) => r.success).length,
        failureCount: results.filter((r) => !r.success).length
      });
      return results;
    } catch (error) {
      await connection.rollback();
      logger.error('Bulk import transaction rolled back', {
        error: (error as Error).message,
        stack: (error as Error).stack
      });
      throw new Error(`Error during bulk import: ${(error as Error).message}`);
    } finally {
      connection.release();
    }
  }
}

export default MenuItem;
