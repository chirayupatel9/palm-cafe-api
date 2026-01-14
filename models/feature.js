const { pool } = require('../config/database');

/**
 * Feature Model
 * Handles feature definitions and cafe feature overrides
 */
class Feature {
  /**
   * Get all features
   */
  static async getAll() {
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM features ORDER BY name'
      );
      // Convert MySQL BOOLEAN (TINYINT) to JavaScript boolean
      return rows.map(row => ({
        ...row,
        default_free: row.default_free === 1 || row.default_free === true,
        default_pro: row.default_pro === 1 || row.default_pro === true
      }));
    } catch (error) {
      throw new Error(`Error fetching features: ${error.message}`);
    }
  }

  /**
   * Get feature by key
   */
  static async getByKey(key) {
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM features WHERE `key` = ?',
        [key]
      );
      if (rows[0]) {
        // Convert MySQL BOOLEAN (TINYINT) to JavaScript boolean
        return {
          ...rows[0],
          default_free: rows[0].default_free === 1 || rows[0].default_free === true,
          default_pro: rows[0].default_pro === 1 || rows[0].default_pro === true
        };
      }
      return null;
    } catch (error) {
      throw new Error(`Error fetching feature: ${error.message}`);
    }
  }

  /**
   * Create a new feature
   */
  static async create(featureData) {
    const { key, name, description, default_free, default_pro } = featureData;
    
    if (!key || !name) {
      throw new Error('Key and name are required');
    }

    try {
      const [result] = await pool.execute(
        `INSERT INTO features (\`key\`, name, description, default_free, default_pro)
         VALUES (?, ?, ?, ?, ?)`,
        [key, name, description || null, default_free || false, default_pro !== undefined ? default_pro : true]
      );

      return await this.getByKey(key);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('A feature with this key already exists');
      }
      throw new Error(`Error creating feature: ${error.message}`);
    }
  }

  /**
   * Update feature
   */
  static async update(key, featureData) {
    const { name, description, default_free, default_pro } = featureData;

    try {
      const updateFields = [];
      const updateValues = [];

      if (name !== undefined) {
        updateFields.push('name = ?');
        updateValues.push(name);
      }

      if (description !== undefined) {
        updateFields.push('description = ?');
        updateValues.push(description);
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
        return await this.getByKey(key);
      }

      updateValues.push(key);

      const [result] = await pool.execute(
        `UPDATE features SET ${updateFields.join(', ')} WHERE \`key\` = ?`,
        updateValues
      );

      if (result.affectedRows === 0) {
        throw new Error('Feature not found');
      }

      return await this.getByKey(key);
    } catch (error) {
      throw new Error(`Error updating feature: ${error.message}`);
    }
  }

  /**
   * Get cafe feature override
   */
  static async getCafeOverride(cafeId, featureKey) {
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM cafe_feature_overrides WHERE cafe_id = ? AND feature_key = ?',
        [cafeId, featureKey]
      );
      return rows[0] || null;
    } catch (error) {
      throw new Error(`Error fetching cafe feature override: ${error.message}`);
    }
  }

  /**
   * Get all overrides for a cafe
   */
  static async getCafeOverrides(cafeId) {
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM cafe_feature_overrides WHERE cafe_id = ?',
        [cafeId]
      );
      
      // Convert to map for easy lookup
      // Convert MySQL BOOLEAN (TINYINT) to JavaScript boolean
      const overrides = {};
      rows.forEach(row => {
        overrides[row.feature_key] = row.enabled === 1 || row.enabled === true;
      });
      
      return overrides;
    } catch (error) {
      throw new Error(`Error fetching cafe feature overrides: ${error.message}`);
    }
  }

  /**
   * Set cafe feature override
   */
  static async setCafeOverride(cafeId, featureKey, enabled) {
    try {
      await pool.execute(`
        INSERT INTO cafe_feature_overrides (cafe_id, feature_key, enabled)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          enabled = VALUES(enabled),
          updated_at = CURRENT_TIMESTAMP
      `, [cafeId, featureKey, enabled]);

      return await this.getCafeOverride(cafeId, featureKey);
    } catch (error) {
      throw new Error(`Error setting cafe feature override: ${error.message}`);
    }
  }

  /**
   * Remove cafe feature override (revert to plan default)
   */
  static async removeCafeOverride(cafeId, featureKey) {
    try {
      const [result] = await pool.execute(
        'DELETE FROM cafe_feature_overrides WHERE cafe_id = ? AND feature_key = ?',
        [cafeId, featureKey]
      );
      return { success: result.affectedRows > 0 };
    } catch (error) {
      throw new Error(`Error removing cafe feature override: ${error.message}`);
    }
  }
}

module.exports = Feature;
