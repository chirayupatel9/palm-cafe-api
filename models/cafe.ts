import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';

const CAFE_SLUG_CACHE_TTL_MS = 60000;
const cafeBySlugCache = new Map<string, { cafe: CafeRow | null; expiry: number }>();

export interface CafeRow {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  is_active?: boolean;
  subscription_plan?: string | null;
  subscription_status?: string | null;
  enabled_modules?: unknown;
  created_at?: Date;
  updated_at?: Date;
  is_onboarded?: boolean;
  onboarding_data?: unknown;
}

export interface CafeCreateData {
  slug: string;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  subscription_plan?: string | null;
  subscription_status?: string | null;
  enabled_modules?: unknown;
  is_onboarded?: boolean;
  onboarding_data?: unknown;
}

export interface CafeUpdateData {
  slug?: string;
  name?: string;
  description?: string | null;
  logo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  is_active?: boolean;
  subscription_plan?: string | null;
  subscription_status?: string | null;
  enabled_modules?: unknown;
  is_onboarded?: boolean;
  onboarding_data?: unknown;
}

function parseCafeRow(row: CafeRow & { enabled_modules?: string; onboarding_data?: string }): CafeRow {
  const cafe = { ...row };
  if (cafe.enabled_modules) {
    try {
      (cafe as { enabled_modules: unknown }).enabled_modules = JSON.parse(cafe.enabled_modules as unknown as string);
    } catch {
      (cafe as { enabled_modules: unknown }).enabled_modules = undefined;
    }
  }
  return cafe as CafeRow;
}

async function applyOnboardingToCafe(
  cafe: CafeRow & { onboarding_data?: string },
  hasOnboardingColumns: boolean
): Promise<CafeRow> {
  if (hasOnboardingColumns) {
    if (cafe.onboarding_data) {
      try {
        (cafe as { onboarding_data: unknown }).onboarding_data = JSON.parse(cafe.onboarding_data as unknown as string);
      } catch {
        (cafe as { onboarding_data: unknown }).onboarding_data = undefined;
      }
    }
    (cafe as { is_onboarded: boolean }).is_onboarded = Boolean(cafe.is_onboarded);
  } else {
    (cafe as { is_onboarded: boolean }).is_onboarded = true;
    (cafe as { onboarding_data: unknown }).onboarding_data = undefined;
  }
  return cafe as CafeRow;
}

class Cafe {
  static async hasOnboardingColumns(): Promise<boolean> {
    try {
      const [columns] = await pool.execute<RowDataPacket[]>(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'cafes'
        AND COLUMN_NAME IN ('is_onboarded', 'onboarding_data')
      `);
      return columns.length === 2;
    } catch {
      return false;
    }
  }

  static async create(cafeData: CafeCreateData): Promise<CafeRow> {
    const {
      slug,
      name,
      description,
      logo_url,
      address,
      phone,
      email,
      website,
      subscription_plan,
      subscription_status,
      enabled_modules,
      is_onboarded,
      onboarding_data
    } = cafeData;

    if (!slug || !name) {
      throw new Error('Slug and name are required');
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new Error('Slug must contain only lowercase letters, numbers, and hyphens');
    }

    try {
      const hasOnboardingColumns = await this.hasOnboardingColumns();
      const onboarded = is_onboarded !== undefined ? is_onboarded : false;
      const onboardingDataJson = onboarding_data ? JSON.stringify(onboarding_data) : null;

      let insertFields =
        'slug, name, description, logo_url, address, phone, email, website, is_active, subscription_plan, subscription_status, enabled_modules';
      const insertValues: (string | number | boolean | null)[] = [
        slug.toLowerCase(),
        name,
        description || null,
        logo_url || null,
        address || null,
        phone || null,
        email || null,
        website || null,
        true,
        subscription_plan || 'FREE',
        subscription_status || 'active',
        enabled_modules ? JSON.stringify(enabled_modules) : null
      ];

      if (hasOnboardingColumns) {
        insertFields += ', is_onboarded, onboarding_data';
        insertValues.push(onboarded, onboardingDataJson);
      }

      const [result] = await pool.execute<RowDataPacket[] & { insertId: number }>(
        `INSERT INTO cafes (${insertFields}) VALUES (${insertValues.map(() => '?').join(', ')})`,
        insertValues
      );
      const created = await this.getById(result.insertId);
      if (!created) throw new Error('Failed to fetch created cafe');
      return created;
    } catch (err) {
      const error = err as { code?: string; message?: string };
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('A cafe with this slug already exists');
      }
      throw new Error(`Error creating cafe: ${error.message}`);
    }
  }

  static async getById(id: number): Promise<CafeRow | null> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>('SELECT * FROM cafes WHERE id = ?', [id]);
      if (rows.length === 0) return null;
      const raw = rows[0] as CafeRow & { enabled_modules?: string; onboarding_data?: string };
      const cafe = parseCafeRow(raw);
      const hasOnboardingColumns = await this.hasOnboardingColumns();
      return applyOnboardingToCafe(cafe as CafeRow & { onboarding_data?: string }, hasOnboardingColumns);
    } catch (err) {
      const error = err as { message?: string };
      throw new Error(`Error fetching cafe: ${error.message}`);
    }
  }

  static invalidateSlugCache(slug: string | null | undefined): void {
    if (!slug) return;
    cafeBySlugCache.delete(String(slug).toLowerCase());
  }

  static async getBySlug(slug: string | null | undefined): Promise<CafeRow | null> {
    const key = (slug || '').toLowerCase();
    const cached = cafeBySlugCache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.cafe;
    }

    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM cafes WHERE slug = ? AND is_active = TRUE',
        [key]
      );
      if (rows.length === 0) {
        cafeBySlugCache.set(key, { cafe: null, expiry: Date.now() + CAFE_SLUG_CACHE_TTL_MS });
        return null;
      }
      const raw = rows[0] as CafeRow & { enabled_modules?: string; onboarding_data?: string };
      const cafe = parseCafeRow(raw);
      const hasOnboardingColumns = await this.hasOnboardingColumns();
      const result = await applyOnboardingToCafe(cafe as CafeRow & { onboarding_data?: string }, hasOnboardingColumns);
      cafeBySlugCache.set(key, { cafe: result, expiry: Date.now() + CAFE_SLUG_CACHE_TTL_MS });
      return result;
    } catch (err) {
      const error = err as { message?: string };
      throw new Error(`Error fetching cafe by slug: ${error.message}`);
    }
  }

  static async getAll(): Promise<(CafeRow & { enabled_modules: unknown })[]> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT id, slug, name, description, logo_url, address, phone, email, website, is_active, subscription_plan, subscription_status, enabled_modules, created_at, updated_at FROM cafes ORDER BY name'
      );
      return (rows as RowDataPacket[]).map((row: RowDataPacket) => ({
        ...row,
        enabled_modules: row.enabled_modules ? JSON.parse(row.enabled_modules as string) : null
      })) as (CafeRow & { enabled_modules: unknown })[];
    } catch (err) {
      const error = err as { message?: string };
      throw new Error(`Error fetching cafes: ${error.message}`);
    }
  }

  static async getFirstActive(): Promise<{ id: number; slug: string; name: string } | null> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT id, slug, name FROM cafes WHERE is_active = TRUE ORDER BY id ASC LIMIT 1'
      );
      return rows.length > 0 ? (rows[0] as { id: number; slug: string; name: string }) : null;
    } catch {
      return null;
    }
  }

  static async getActive(): Promise<RowDataPacket[]> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT id, slug, name, description, logo_url, address, phone, email, website, created_at, updated_at FROM cafes WHERE is_active = TRUE ORDER BY name'
      );
      return rows;
    } catch (err) {
      const error = err as { message?: string };
      throw new Error(`Error fetching active cafes: ${error.message}`);
    }
  }

  static async update(id: number, cafeData: CafeUpdateData): Promise<CafeRow> {
    const {
      slug,
      name,
      description,
      logo_url,
      address,
      phone,
      email,
      website,
      is_active,
      subscription_plan,
      subscription_status,
      enabled_modules,
      is_onboarded,
      onboarding_data
    } = cafeData;

    try {
      const updateFields: string[] = [];
      const updateValues: (string | number | boolean | null)[] = [];

      if (slug !== undefined) {
        if (!/^[a-z0-9-]+$/.test(slug)) {
          throw new Error('Slug must contain only lowercase letters, numbers, and hyphens');
        }
        updateFields.push('slug = ?');
        updateValues.push(slug.toLowerCase());
      }
      if (name !== undefined) {
        updateFields.push('name = ?');
        updateValues.push(name);
      }
      if (description !== undefined) {
        updateFields.push('description = ?');
        updateValues.push(description);
      }
      if (logo_url !== undefined) {
        updateFields.push('logo_url = ?');
        updateValues.push(logo_url);
      }
      if (address !== undefined) {
        updateFields.push('address = ?');
        updateValues.push(address);
      }
      if (phone !== undefined) {
        updateFields.push('phone = ?');
        updateValues.push(phone);
      }
      if (email !== undefined) {
        updateFields.push('email = ?');
        updateValues.push(email);
      }
      if (website !== undefined) {
        updateFields.push('website = ?');
        updateValues.push(website);
      }
      if (is_active !== undefined) {
        updateFields.push('is_active = ?');
        updateValues.push(is_active);
      }
      if (subscription_plan !== undefined) {
        updateFields.push('subscription_plan = ?');
        updateValues.push(subscription_plan);
      }
      if (subscription_status !== undefined) {
        updateFields.push('subscription_status = ?');
        updateValues.push(subscription_status);
      }
      if (enabled_modules !== undefined) {
        updateFields.push('enabled_modules = ?');
        updateValues.push(enabled_modules ? JSON.stringify(enabled_modules) : null);
      }

      const hasOnboardingColumns = await this.hasOnboardingColumns();
      if (is_onboarded !== undefined) {
        if (!hasOnboardingColumns) {
          throw new Error(
            'Onboarding columns not found. Please run migration: node migrations/migration-023-add-cafe-onboarding.js'
          );
        }
        updateFields.push('is_onboarded = ?');
        updateValues.push(Boolean(is_onboarded));
      }
      if (onboarding_data !== undefined) {
        if (!hasOnboardingColumns) {
          throw new Error(
            'Onboarding columns not found. Please run migration: node migrations/migration-023-add-cafe-onboarding.js'
          );
        }
        updateFields.push('onboarding_data = ?');
        updateValues.push(onboarding_data ? JSON.stringify(onboarding_data) : null);
      }

      if (updateFields.length === 0) {
        const c = await this.getById(id);
        if (!c) throw new Error('Cafe not found');
        return c;
      }

      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      updateValues.push(id);

      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(
        `UPDATE cafes SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
      if (result.affectedRows === 0) {
        throw new Error('Cafe not found');
      }
      const updated = await this.getById(id);
      if (!updated) throw new Error('Cafe not found');
      return updated;
    } catch (err) {
      const error = err as { code?: string; message?: string };
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('A cafe with this slug already exists');
      }
      throw new Error(`Error updating cafe: ${error.message}`);
    }
  }

  static async delete(id: number): Promise<{ success: boolean }> {
    try {
      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(
        'UPDATE cafes SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );
      if (result.affectedRows === 0) {
        throw new Error('Cafe not found');
      }
      return { success: true };
    } catch (err) {
      const error = err as { message?: string };
      throw new Error(`Error deleting cafe: ${error.message}`);
    }
  }

  static async slugExists(slug: string, excludeId: number | null = null): Promise<boolean> {
    try {
      let query = 'SELECT COUNT(*) as count FROM cafes WHERE slug = ?';
      const params: (string | number)[] = [slug.toLowerCase()];
      if (excludeId) {
        query += ' AND id != ?';
        params.push(excludeId);
      }
      const [rows] = await pool.execute<RowDataPacket[]>(query, params);
      return (rows[0] as { count: number }).count > 0;
    } catch (err) {
      const error = err as { message?: string };
      throw new Error(`Error checking slug: ${error.message}`);
    }
  }
}

export default Cafe;
