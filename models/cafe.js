const { pool } = require('../config/database');

// In-memory cache for getBySlug to reduce DB load on login/order creation (TTL 60s)
const CAFE_SLUG_CACHE_TTL_MS = 60000;
const cafeBySlugCache = new Map();

/**
 * Cafe Model
 * Handles all cafe-related database operations for multi-tenant support
 */
class Cafe {
  /**
   * Check if onboarding columns exist in the database
   */
  static async hasOnboardingColumns() {
    try {
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'cafes' 
        AND COLUMN_NAME IN ('is_onboarded', 'onboarding_data')
      `);
      return columns.length === 2;
    } catch (error) {
      return false;
    }
  }
  /**
   * Create a new cafe
   */
  static async create(cafeData) {
    const { slug, name, description, logo_url, address, phone, email, website, subscription_plan, subscription_status, enabled_modules, is_onboarded, onboarding_data } = cafeData;
    
    if (!slug || !name) {
      throw new Error('Slug and name are required');
    }

    // Validate slug format (alphanumeric and hyphens only)
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new Error('Slug must contain only lowercase letters, numbers, and hyphens');
    }

    try {
      // Check if onboarding columns exist
      const hasOnboardingColumns = await this.hasOnboardingColumns();
      
      // New cafes default to NOT onboarded unless explicitly set
      const onboarded = is_onboarded !== undefined ? is_onboarded : false;
      const onboardingDataJson = onboarding_data ? JSON.stringify(onboarding_data) : null;

      let insertFields = 'slug, name, description, logo_url, address, phone, email, website, is_active, subscription_plan, subscription_status, enabled_modules';
      let insertValues = [
        slug.toLowerCase(), 
        name, 
        description || null, 
        logo_url || null, 
        address || null, 
        phone || null, 
        email || null, 
        website || null,
        subscription_plan || 'FREE',
        subscription_status || 'active',
        enabled_modules ? JSON.stringify(enabled_modules) : null
      ];

      // Add onboarding columns if they exist
      if (hasOnboardingColumns) {
        insertFields += ', is_onboarded, onboarding_data';
        insertValues.push(onboarded, onboardingDataJson);
      }

      const [result] = await pool.execute(
        `INSERT INTO cafes (${insertFields})
         VALUES (${insertValues.map(() => '?').join(', ')})`,
        insertValues
      );

      return await this.getById(result.insertId);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('A cafe with this slug already exists');
      }
      throw new Error(`Error creating cafe: ${error.message}`);
    }
  }

  /**
   * Get cafe by ID
   */
  static async getById(id) {
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM cafes WHERE id = ?',
        [id]
      );

      if (rows.length === 0) {
        return null;
      }

      const cafe = rows[0];
      // Parse enabled_modules JSON if present
      if (cafe.enabled_modules) {
        try {
          cafe.enabled_modules = JSON.parse(cafe.enabled_modules);
        } catch (e) {
          cafe.enabled_modules = null;
        }
      }

      // Parse onboarding_data JSON if present (only if column exists)
      const hasOnboardingColumns = await this.hasOnboardingColumns();
      if (hasOnboardingColumns) {
        if (cafe.onboarding_data) {
          try {
            cafe.onboarding_data = JSON.parse(cafe.onboarding_data);
          } catch (e) {
            cafe.onboarding_data = null;
          }
        }
        // Ensure is_onboarded is a boolean
        cafe.is_onboarded = Boolean(cafe.is_onboarded);
      } else {
        // Default values if columns don't exist
        cafe.is_onboarded = true; // Grandfather existing cafes
        cafe.onboarding_data = null;
      }

      return cafe;
    } catch (error) {
      throw new Error(`Error fetching cafe: ${error.message}`);
    }
  }

  /**
   * Get cafe by slug (cached 60s to reduce DB load on login/order creation)
   */
  static async getBySlug(slug) {
    const key = (slug || '').toLowerCase();
    const cached = cafeBySlugCache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.cafe;
    }

    try {
      const [rows] = await pool.execute(
        'SELECT * FROM cafes WHERE slug = ? AND is_active = TRUE',
        [key]
      );

      if (rows.length === 0) {
        cafeBySlugCache.set(key, { cafe: null, expiry: Date.now() + CAFE_SLUG_CACHE_TTL_MS });
        return null;
      }

      const cafe = rows[0];
      // Parse enabled_modules JSON if present
      if (cafe.enabled_modules) {
        try {
          cafe.enabled_modules = JSON.parse(cafe.enabled_modules);
        } catch (e) {
          cafe.enabled_modules = null;
        }
      }

      // Parse onboarding_data JSON if present (only if column exists)
      const hasOnboardingColumns = await this.hasOnboardingColumns();
      if (hasOnboardingColumns) {
        if (cafe.onboarding_data) {
          try {
            cafe.onboarding_data = JSON.parse(cafe.onboarding_data);
          } catch (e) {
            cafe.onboarding_data = null;
          }
        }
        // Ensure is_onboarded is a boolean
        cafe.is_onboarded = Boolean(cafe.is_onboarded);
      } else {
        // Default values if columns don't exist
        cafe.is_onboarded = true; // Grandfather existing cafes
        cafe.onboarding_data = null;
      }

      cafeBySlugCache.set(key, { cafe, expiry: Date.now() + CAFE_SLUG_CACHE_TTL_MS });
      return cafe;
    } catch (error) {
      throw new Error(`Error fetching cafe by slug: ${error.message}`);
    }
  }

  /**
   * Get all cafes (for Super Admin)
   */
  static async getAll() {
    try {
      const [rows] = await pool.execute(
        'SELECT id, slug, name, description, logo_url, address, phone, email, website, is_active, subscription_plan, subscription_status, enabled_modules, created_at, updated_at FROM cafes ORDER BY name'
      );

      // Parse enabled_modules JSON if present
      return rows.map(row => ({
        ...row,
        enabled_modules: row.enabled_modules ? JSON.parse(row.enabled_modules) : null
      }));
    } catch (error) {
      throw new Error(`Error fetching cafes: ${error.message}`);
    }
  }

  /**
   * Get active cafes only
   */
  static async getActive() {
    try {
      const [rows] = await pool.execute(
        'SELECT id, slug, name, description, logo_url, address, phone, email, website, created_at, updated_at FROM cafes WHERE is_active = TRUE ORDER BY name'
      );

      return rows;
    } catch (error) {
      throw new Error(`Error fetching active cafes: ${error.message}`);
    }
  }

  /**
   * Update cafe
   */
  static async update(id, cafeData) {
    const { slug, name, description, logo_url, address, phone, email, website, is_active, subscription_plan, subscription_status, enabled_modules, is_onboarded, onboarding_data } = cafeData;

    try {
      const updateFields = [];
      const updateValues = [];

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

      // Check if onboarding columns exist before trying to update them
      const hasOnboardingColumns = await this.hasOnboardingColumns();
      
      if (is_onboarded !== undefined) {
        if (!hasOnboardingColumns) {
          throw new Error('Onboarding columns not found. Please run migration: node migrations/migration-023-add-cafe-onboarding.js');
        }
        updateFields.push('is_onboarded = ?');
        updateValues.push(Boolean(is_onboarded));
      }

      if (onboarding_data !== undefined) {
        if (!hasOnboardingColumns) {
          throw new Error('Onboarding columns not found. Please run migration: node migrations/migration-023-add-cafe-onboarding.js');
        }
        updateFields.push('onboarding_data = ?');
        updateValues.push(onboarding_data ? JSON.stringify(onboarding_data) : null);
      }

      if (updateFields.length === 0) {
        return await this.getById(id);
      }

      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      updateValues.push(id);
      
      const [result] = await pool.execute(
        `UPDATE cafes SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );

      if (result.affectedRows === 0) {
        throw new Error('Cafe not found');
      }

      const updatedCafe = await this.getById(id);
      
      return updatedCafe;
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('A cafe with this slug already exists');
      }
      throw new Error(`Error updating cafe: ${error.message}`);
    }
  }

  /**
   * Delete cafe (soft delete by setting is_active = FALSE)
   */
  static async delete(id) {
    try {
      const [result] = await pool.execute(
        'UPDATE cafes SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );

      if (result.affectedRows === 0) {
        throw new Error('Cafe not found');
      }

      return { success: true };
    } catch (error) {
      throw new Error(`Error deleting cafe: ${error.message}`);
    }
  }

  /**
   * Check if slug exists
   */
  static async slugExists(slug, excludeId = null) {
    try {
      let query = 'SELECT COUNT(*) as count FROM cafes WHERE slug = ?';
      const params = [slug.toLowerCase()];

      if (excludeId) {
        query += ' AND id != ?';
        params.push(excludeId);
      }

      const [rows] = await pool.execute(query, params);
      return rows[0].count > 0;
    } catch (error) {
      throw new Error(`Error checking slug: ${error.message}`);
    }
  }
}

module.exports = Cafe;
