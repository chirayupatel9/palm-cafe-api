import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';

export interface CategoryRow {
  id: number;
  name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface CategoryCreateData {
  name: string;
  description?: string | null;
  sort_order?: number;
  cafe_id?: number | null;
}

export interface CategoryUpdateData {
  name?: string;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface CategoryWithItemCount extends CategoryRow {
  item_count: number;
}

class Category {
  static async getAll(cafeId: number | null = null): Promise<CategoryRow[]> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;

      let whereClause = 'WHERE is_active = TRUE';
      const params: number[] = [];
      if (hasCafeId && cafeId) {
        whereClause += ' AND cafe_id = ?';
        params.push(cafeId);
      } else if (hasCafeId && !cafeId) {
        return [];
      }

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, name, description, sort_order, is_active, created_at, updated_at FROM categories ${whereClause} ORDER BY sort_order, name`,
        params
      );
      return (rows as RowDataPacket[]).map((row: RowDataPacket) => ({
        ...row,
        sort_order: parseInt(String(row.sort_order), 10)
      })) as CategoryRow[];
    } catch (error) {
      throw new Error(`Error fetching categories: ${(error as Error).message}`);
    }
  }

  static async getById(id: number): Promise<CategoryRow | null> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT id, name, description, sort_order, is_active, created_at, updated_at FROM categories WHERE id = ?',
        [id]
      );
      if (rows.length === 0) return null;
      const r = rows[0] as RowDataPacket;
      return {
        ...r,
        sort_order: parseInt(String(r.sort_order), 10)
      } as CategoryRow;
    } catch (error) {
      throw new Error(`Error fetching category: ${(error as Error).message}`);
    }
  }

  static async create(categoryData: CategoryCreateData): Promise<CategoryRow & { id: number }> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;
      const { name, description, sort_order, cafe_id } = categoryData;

      if (hasCafeId && !cafe_id) throw new Error('cafe_id is required when creating a category');

      let query: string;
      let params: (string | number)[];
      if (hasCafeId) {
        query = 'INSERT INTO categories (name, description, sort_order, cafe_id) VALUES (?, ?, ?, ?)';
        params = [name.trim(), description ? description.trim() : '', sort_order || 0, cafe_id!];
      } else {
        query = 'INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)';
        params = [name.trim(), description ? description.trim() : '', sort_order || 0];
      }

      const [result] = await pool.execute<RowDataPacket[] & { insertId: number }>(query, params);
      return {
        id: result.insertId,
        name: name.trim(),
        description: description ? description.trim() : '',
        sort_order: sort_order || 0,
        is_active: true
      };
    } catch (error) {
      throw new Error(`Error creating category: ${(error as Error).message}`);
    }
  }

  static async update(
    id: number,
    categoryData: CategoryUpdateData,
    cafeId: number | null = null
  ): Promise<CategoryRow> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;

      if (hasCafeId && cafeId) {
        const [existing] = await pool.execute<RowDataPacket[]>(
          'SELECT cafe_id FROM categories WHERE id = ?',
          [id]
        );
        if (existing.length === 0) throw new Error('Category not found');
        if ((existing[0] as RowDataPacket).cafe_id !== cafeId) {
          throw new Error('Category does not belong to this cafe');
        }
      }

      const { name, description, sort_order, is_active } = categoryData;
      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(
        'UPDATE categories SET name = ?, description = ?, sort_order = ?, is_active = ? WHERE id = ?',
        [(name ?? '').trim(), description ? description.trim() : '', sort_order ?? 0, is_active ?? true, id]
      );
      if (result.affectedRows === 0) throw new Error('Category not found');
      const updated = await this.getById(id);
      if (!updated) throw new Error('Category not found');
      return updated;
    } catch (error) {
      throw new Error(`Error updating category: ${(error as Error).message}`);
    }
  }

  static async delete(id: number, cafeId: number | null = null): Promise<boolean> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = columns.length > 0;

      if (hasCafeId && cafeId) {
        const [existing] = await pool.execute<RowDataPacket[]>(
          'SELECT cafe_id FROM categories WHERE id = ?',
          [id]
        );
        if (existing.length === 0) throw new Error('Category not found');
        if ((existing[0] as RowDataPacket).cafe_id !== cafeId) {
          throw new Error('Category does not belong to this cafe');
        }
      }

      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(
        'UPDATE categories SET is_active = FALSE WHERE id = ?',
        [id]
      );
      if (result.affectedRows === 0) throw new Error('Category not found');
      return true;
    } catch (error) {
      throw new Error(`Error deleting category: ${(error as Error).message}`);
    }
  }

  static async getWithItemCounts(cafeId: number | null = null): Promise<CategoryWithItemCount[]> {
    try {
      const [categoryColumns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'cafe_id'
      `);
      const [menuColumns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = categoryColumns.length > 0 && menuColumns.length > 0;

      let whereClause = 'WHERE c.is_active = TRUE';
      let joinClause =
        'LEFT JOIN menu_items m ON c.id = m.category_id AND m.is_available = TRUE';
      const params: number[] = [];
      if (hasCafeId && cafeId) {
        whereClause += ' AND c.cafe_id = ?';
        joinClause += ' AND m.cafe_id = ?';
        params.push(cafeId, cafeId);
      } else if (hasCafeId && !cafeId) {
        return [];
      }

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT c.id, c.name, c.description, c.sort_order, c.is_active, COUNT(m.id) as item_count
         FROM categories c ${joinClause} ${whereClause}
         GROUP BY c.id, c.name, c.description, c.sort_order, c.is_active
         ORDER BY c.sort_order, c.name`,
        params
      );
      return (rows as RowDataPacket[]).map((row: RowDataPacket) => ({
        ...row,
        sort_order: parseInt(String(row.sort_order), 10),
        item_count: parseInt(String(row.item_count), 10)
      })) as CategoryWithItemCount[];
    } catch (error) {
      throw new Error(`Error fetching categories with item counts: ${(error as Error).message}`);
    }
  }

  static async generateFromMenuItems(cafeId: number | null = null): Promise<
    { id: number; name: string; description: string; sort_order: number; is_active: boolean; item_count: number }[]
  > {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [menuColumns] = await connection.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'cafe_id'
      `);
      const [categoryColumns] = await connection.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = menuColumns.length > 0 && categoryColumns.length > 0;

      let whereClause = 'WHERE m.is_available = TRUE';
      const params: number[] = [];
      if (hasCafeId && cafeId) {
        whereClause += ' AND m.cafe_id = ?';
        params.push(cafeId);
      } else if (hasCafeId && !cafeId) {
        throw new Error('cafeId is required when cafe_id column exists');
      }

      const [menuCategories] = await connection.execute<RowDataPacket[]>(
        `SELECT DISTINCT c.name as category_name, c.description as category_description, c.sort_order, COUNT(m.id) as item_count
         FROM menu_items m
         LEFT JOIN categories c ON m.category_id = c.id
         ${whereClause}
         GROUP BY c.name, c.description, c.sort_order
         ORDER BY c.sort_order, c.name`,
        params
      );

      let existingCategoriesQuery = 'SELECT id, name, is_active FROM categories';
      const existingParams: number[] = [];
      if (hasCafeId && cafeId) {
        existingCategoriesQuery += ' WHERE cafe_id = ?';
        existingParams.push(cafeId);
      }
      const [existingCategories] = await connection.execute<RowDataPacket[]>(
        existingCategoriesQuery,
        existingParams
      );
      const existingCategoryMap: Record<string, { id: number; name: string; is_active: boolean }> = {};
      (existingCategories as RowDataPacket[]).forEach((cat: RowDataPacket) => {
        existingCategoryMap[cat.name as string] = {
          id: cat.id as number,
          name: cat.name as string,
          is_active: cat.is_active as boolean
        };
      });

      const generatedCategories: {
        id: number;
        name: string;
        description: string;
        sort_order: number;
        is_active: boolean;
        item_count: number;
      }[] = [];

      for (const menuCategory of menuCategories as RowDataPacket[]) {
        const categoryName = menuCategory.category_name as string;
        if (categoryName) {
          const nameTrimmed = categoryName.trim();
          if (existingCategoryMap[nameTrimmed]) {
            const cat = existingCategoryMap[nameTrimmed];
            if (!cat.is_active) {
              await connection.execute(
                'UPDATE categories SET is_active = TRUE WHERE id = ?',
                [cat.id]
              );
            }
            generatedCategories.push({
              ...cat,
              description: '',
              sort_order: menuCategory.sort_order as number,
              item_count: menuCategory.item_count as number
            });
          } else {
            let insertQuery =
              'INSERT INTO categories (name, description, sort_order, is_active';
            const insertParams: (string | number)[] = [
              nameTrimmed,
              (menuCategory.category_description as string) || '',
              (menuCategory.sort_order as number) || 0
            ];
            if (hasCafeId && cafeId) {
              insertQuery += ', cafe_id) VALUES (?, ?, ?, TRUE, ?)';
              insertParams.push(cafeId);
            } else {
              insertQuery += ') VALUES (?, ?, ?, TRUE)';
            }
            const [result] = await connection.execute<RowDataPacket[] & { insertId: number }>(
              insertQuery,
              insertParams
            );
            generatedCategories.push({
              id: result.insertId,
              name: nameTrimmed,
              description: (menuCategory.category_description as string) || '',
              sort_order: (menuCategory.sort_order as number) || 0,
              is_active: true,
              item_count: menuCategory.item_count as number
            });
          }
        }
      }

      const activeCategoryNames = (menuCategories as RowDataPacket[])
        .filter((c) => c.category_name)
        .map((c) => (c.category_name as string).trim());
      if (activeCategoryNames.length > 0) {
        let deactivateQuery = `UPDATE categories SET is_active = FALSE WHERE name NOT IN (${activeCategoryNames.map(() => '?').join(',')})`;
        const deactivateParams: (string | number)[] = [...activeCategoryNames];
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
      throw new Error(`Error generating categories from menu items: ${(error as Error).message}`);
    } finally {
      connection.release();
    }
  }

  static async getAutoGenerated(cafeId: number | null = null): Promise<CategoryWithItemCount[]> {
    try {
      const [categoryColumns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'cafe_id'
      `);
      const [menuColumns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'cafe_id'
      `);
      const hasCafeId = categoryColumns.length > 0 && menuColumns.length > 0;

      let whereClause = 'WHERE c.is_active = TRUE';
      let joinClause =
        'INNER JOIN menu_items m ON c.id = m.category_id AND m.is_available = TRUE';
      const params: number[] = [];
      if (hasCafeId && cafeId) {
        whereClause += ' AND c.cafe_id = ?';
        joinClause += ' AND m.cafe_id = ?';
        params.push(cafeId, cafeId);
      } else if (hasCafeId && !cafeId) {
        return [];
      }

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT c.id, c.name, c.description, c.sort_order, c.is_active, COUNT(m.id) as item_count
         FROM categories c ${joinClause} ${whereClause}
         GROUP BY c.id, c.name, c.description, c.sort_order, c.is_active
         ORDER BY c.sort_order, c.name`,
        params
      );
      return (rows as RowDataPacket[]).map((row: RowDataPacket) => ({
        ...row,
        sort_order: parseInt(String(row.sort_order), 10),
        item_count: parseInt(String(row.item_count), 10)
      })) as CategoryWithItemCount[];
    } catch (error) {
      throw new Error(`Error fetching auto-generated categories: ${(error as Error).message}`);
    }
  }
}

export default Category;
