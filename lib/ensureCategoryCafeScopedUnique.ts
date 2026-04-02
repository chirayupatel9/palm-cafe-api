import type { Pool } from 'mysql2/promise';
import { RowDataPacket } from 'mysql2';
import logger from '../config/logger';

/**
 * Legacy schemas used UNIQUE(name) on categories, which blocks the same category name
 * for two cafes. Import then fails with "already exists but couldn't be found for this cafe".
 * Migrates to UNIQUE(cafe_id, name) when cafe_id exists.
 */
export async function ensureCategoryCafeScopedUnique(pool: Pool): Promise<void> {
  let conn: import('mysql2/promise').PoolConnection | undefined;
  try {
    conn = await pool.getConnection();

    const [tables] = await conn.query<RowDataPacket[]>(`SHOW TABLES LIKE 'categories'`);
    if (!tables?.length) {
      return;
    }

    const [cols] = await conn.query<RowDataPacket[]>(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'cafe_id'
    `);
    if (!cols?.length) {
      return;
    }

    const [usage] = await conn.query<RowDataPacket[]>(`
      SELECT tc.CONSTRAINT_NAME, kcu.COLUMN_NAME
      FROM information_schema.TABLE_CONSTRAINTS tc
      INNER JOIN information_schema.KEY_COLUMN_USAGE kcu
        ON tc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
        AND tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
        AND tc.TABLE_NAME = kcu.TABLE_NAME
      WHERE tc.TABLE_SCHEMA = DATABASE()
        AND tc.TABLE_NAME = 'categories'
        AND tc.CONSTRAINT_TYPE = 'UNIQUE'
      ORDER BY tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
    `);

    const byConstraint: Record<string, string[]> = {};
    for (const row of usage || []) {
      const cname = String(row.CONSTRAINT_NAME);
      if (!byConstraint[cname]) {
        byConstraint[cname] = [];
      }
      byConstraint[cname].push(String(row.COLUMN_NAME));
    }

    const legacyNameOnly: string[] = [];
    for (const [constraintName, columns] of Object.entries(byConstraint)) {
      const sorted = [...columns].sort();
      if (sorted.length === 1 && sorted[0] === 'name') {
        legacyNameOnly.push(constraintName);
      }
    }

    for (const indexName of legacyNameOnly) {
      const safe = indexName.replace(/[^a-zA-Z0-9_]/g, '');
      if (safe !== indexName) {
        logger.warn('Skipping DROP INDEX: unexpected constraint name', { indexName });
        continue;
      }
      logger.info('categories migration: dropping global UNIQUE(name)', { indexName: safe });
      await conn.query(`ALTER TABLE categories DROP INDEX \`${safe}\``);
    }

    const [usageAfter] = await conn.query<RowDataPacket[]>(`
      SELECT tc.CONSTRAINT_NAME, kcu.COLUMN_NAME
      FROM information_schema.TABLE_CONSTRAINTS tc
      INNER JOIN information_schema.KEY_COLUMN_USAGE kcu
        ON tc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
        AND tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
        AND tc.TABLE_NAME = kcu.TABLE_NAME
      WHERE tc.TABLE_SCHEMA = DATABASE()
        AND tc.TABLE_NAME = 'categories'
        AND tc.CONSTRAINT_TYPE = 'UNIQUE'
      ORDER BY tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
    `);

    const by2: Record<string, string[]> = {};
    for (const row of usageAfter || []) {
      const cname = String(row.CONSTRAINT_NAME);
      if (!by2[cname]) {
        by2[cname] = [];
      }
      by2[cname].push(String(row.COLUMN_NAME));
    }

    const hasComposite = Object.values(by2).some((columns) => {
      const s = [...columns].sort();
      return s.length === 2 && s[0] === 'cafe_id' && s[1] === 'name';
    });

    if (hasComposite) {
      logger.info('categories: UNIQUE(cafe_id, name) is already defined');
      return;
    }

    const [dups] = await conn.query<RowDataPacket[]>(`
      SELECT cafe_id, name, COUNT(*) AS cnt FROM categories
      GROUP BY cafe_id, name HAVING cnt > 1
    `);
    if (dups.length > 0) {
      logger.warn('categories: duplicate (cafe_id, name) rows; cannot add UNIQUE until fixed', {
        sample: dups.slice(0, 5)
      });
      return;
    }

    await conn.query(
      'ALTER TABLE categories ADD UNIQUE KEY uq_categories_cafe_id_name (cafe_id, name)'
    );
    logger.info('categories: added UNIQUE KEY uq_categories_cafe_id_name (cafe_id, name)');
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('Duplicate key name') && msg.includes('uq_categories_cafe_id_name')) {
      return;
    }
    logger.error('ensureCategoryCafeScopedUnique failed (non-fatal)', { message: msg });
  } finally {
    conn?.release();
  }
}
