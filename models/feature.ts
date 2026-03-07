import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';

export interface FeatureRow {
  key: string;
  name: string;
  description?: string | null;
  default_free: boolean;
  default_pro: boolean;
}

export interface FeatureCreateData {
  key: string;
  name: string;
  description?: string | null;
  default_free?: boolean;
  default_pro?: boolean;
}

export interface FeatureUpdateData {
  name?: string;
  description?: string | null;
  default_free?: boolean;
  default_pro?: boolean;
}

export interface CafeFeatureOverrideRow {
  cafe_id: number;
  feature_key: string;
  enabled: boolean;
  updated_at?: Date;
}

class Feature {
  static async getAll(): Promise<FeatureRow[]> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM features ORDER BY name'
      );
      return (rows as RowDataPacket[]).map((row: RowDataPacket) => ({
        ...row,
        default_free: row.default_free === 1 || row.default_free === true,
        default_pro: row.default_pro === 1 || row.default_pro === true
      })) as FeatureRow[];
    } catch (error) {
      throw new Error(`Error fetching features: ${(error as Error).message}`);
    }
  }

  static async getByKey(key: string): Promise<FeatureRow | null> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM features WHERE `key` = ?',
        [key]
      );
      if (rows[0]) {
        const r = rows[0] as RowDataPacket;
        return {
          ...r,
          default_free: r.default_free === 1 || r.default_free === true,
          default_pro: r.default_pro === 1 || r.default_pro === true
        } as FeatureRow;
      }
      return null;
    } catch (error) {
      throw new Error(`Error fetching feature: ${(error as Error).message}`);
    }
  }

  static async create(featureData: FeatureCreateData): Promise<FeatureRow> {
    const { key, name, description, default_free, default_pro } = featureData;
    if (!key || !name) throw new Error('Key and name are required');

    try {
      await pool.execute(
        `INSERT INTO features (\`key\`, name, description, default_free, default_pro) VALUES (?, ?, ?, ?, ?)`,
        [key, name, description ?? null, default_free ?? false, default_pro !== undefined ? default_pro : true]
      );
      const created = await this.getByKey(key);
      if (!created) throw new Error('Failed to fetch created feature');
      return created;
    } catch (err) {
      const error = err as { code?: string; message?: string };
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('A feature with this key already exists');
      }
      throw new Error(`Error creating feature: ${error.message}`);
    }
  }

  static async update(key: string, featureData: FeatureUpdateData): Promise<FeatureRow> {
    const { name, description, default_free, default_pro } = featureData;

    try {
      const updateFields: string[] = [];
      const updateValues: (string | boolean | null)[] = [];

      if (name !== undefined) {
        updateFields.push('name = ?');
        updateValues.push(name);
      }
      if (description !== undefined) {
        updateFields.push('description = ?');
        updateValues.push(description ?? null);
      }
      if (default_free !== undefined) {
        updateFields.push('default_free = ?');
        updateValues.push(default_free);
      }
      if (default_pro !== undefined) {
        updateFields.push('default_pro = ?');
        updateValues.push(default_pro);
      }

      if (updateFields.length === 0) {
        const existing = await this.getByKey(key);
        if (!existing) throw new Error('Feature not found');
        return existing;
      }

      updateValues.push(key);
      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(
        `UPDATE features SET ${updateFields.join(', ')} WHERE \`key\` = ?`,
        updateValues
      );
      if (result.affectedRows === 0) throw new Error('Feature not found');
      const updated = await this.getByKey(key);
      if (!updated) throw new Error('Feature not found');
      return updated;
    } catch (error) {
      throw new Error(`Error updating feature: ${(error as Error).message}`);
    }
  }

  static async getCafeOverride(cafeId: number, featureKey: string): Promise<CafeFeatureOverrideRow | null> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM cafe_feature_overrides WHERE cafe_id = ? AND feature_key = ?',
        [cafeId, featureKey]
      );
      return (rows[0] as CafeFeatureOverrideRow) || null;
    } catch (error) {
      throw new Error(`Error fetching cafe feature override: ${(error as Error).message}`);
    }
  }

  static async getCafeOverrides(cafeId: number): Promise<Record<string, boolean>> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM cafe_feature_overrides WHERE cafe_id = ?',
        [cafeId]
      );
      const overrides: Record<string, boolean> = {};
      (rows as RowDataPacket[]).forEach((row: RowDataPacket) => {
        overrides[row.feature_key as string] = row.enabled === 1 || row.enabled === true;
      });
      return overrides;
    } catch (error) {
      throw new Error(`Error fetching cafe feature overrides: ${(error as Error).message}`);
    }
  }

  static async setCafeOverride(
    cafeId: number,
    featureKey: string,
    enabled: boolean
  ): Promise<CafeFeatureOverrideRow | null> {
    try {
      await pool.execute(
        `INSERT INTO cafe_feature_overrides (cafe_id, feature_key, enabled)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_at = CURRENT_TIMESTAMP`,
        [cafeId, featureKey, enabled]
      );
      return await this.getCafeOverride(cafeId, featureKey);
    } catch (error) {
      throw new Error(`Error setting cafe feature override: ${(error as Error).message}`);
    }
  }

  static async removeCafeOverride(cafeId: number, featureKey: string): Promise<{ success: boolean }> {
    try {
      const [result] = await pool.execute<RowDataPacket[] & { affectedRows: number }>(
        'DELETE FROM cafe_feature_overrides WHERE cafe_id = ? AND feature_key = ?',
        [cafeId, featureKey]
      );
      return { success: result.affectedRows > 0 };
    } catch (error) {
      throw new Error(`Error removing cafe feature override: ${(error as Error).message}`);
    }
  }
}

export default Feature;
