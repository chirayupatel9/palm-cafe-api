/**
 * Insert one category and one menu item for cafe_id 1 for browser E2E (add to cart / place order).
 * Call after seedE2e(). Safe to run multiple times (checks existing).
 */
const { pool } = require('../../config/database');

async function seedBrowserMenu() {
  const conn = await pool.getConnection();
  try {
    const [catCols] = await conn.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'cafe_id'
    `);
    const [menuCols] = await conn.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'cafe_id'
    `);
    const hasCafeIdCat = catCols.length > 0;
    const hasCafeIdMenu = menuCols.length > 0;

    let categoryId;
    const [existingCat] = await conn.execute(
      'SELECT id FROM categories WHERE name = ? AND (cafe_id = 1 OR cafe_id IS NULL) LIMIT 1',
      ['E2E Drinks']
    );
    if (existingCat.length > 0) {
      categoryId = existingCat[0].id;
    } else {
      if (hasCafeIdCat) {
        const [r] = await conn.execute(
          'INSERT INTO categories (name, description, sort_order, cafe_id) VALUES (?, ?, ?, ?)',
          ['E2E Drinks', 'For browser tests', 0, 1]
        );
        categoryId = r.insertId;
      } else {
        const [r] = await conn.execute(
          'INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?, ?)',
          ['E2E Drinks', 'For browser tests', 0]
        );
        categoryId = r.insertId;
      }
    }

    const [existingItem] = await conn.execute(
      'SELECT id FROM menu_items WHERE name = ? AND (cafe_id = 1 OR cafe_id IS NULL) LIMIT 1',
      ['E2E Coffee']
    );
    if (existingItem.length === 0) {
      if (hasCafeIdMenu) {
        await conn.execute(
          'INSERT INTO menu_items (category_id, name, description, price, sort_order, cafe_id) VALUES (?, ?, ?, ?, ?, ?)',
          [categoryId, 'E2E Coffee', 'Browser test item', 10, 0, 1]
        );
      } else {
        await conn.execute(
          'INSERT INTO menu_items (category_id, name, description, price, sort_order) VALUES (?, ?, ?, ?, ?)',
          [categoryId, 'E2E Coffee', 'Browser test item', 10, 0]
        );
      }
    }
  } finally {
    conn.release();
  }
}

module.exports = { seedBrowserMenu };
