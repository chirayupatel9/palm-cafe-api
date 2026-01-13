const { pool } = require('../config/database');

/**
 * Cafe Model
 * Handles all cafe-related database operations for multi-tenant support
 */
class Cafe {
  /**
   * Create a new cafe
   */
  static async create(cafeData) {
    const { slug, name, description, logo_url, address, phone, email, website } = cafeData;
    
    if (!slug || !name) {
      throw new Error('Slug and name are required');
    }

    // Validate slug format (alphanumeric and hyphens only)
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new Error('Slug must contain only lowercase letters, numbers, and hyphens');
    }

    try {
      const [result] = await pool.execute(
        `INSERT INTO cafes (slug, name, description, logo_url, address, phone, email, website, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [slug.toLowerCase(), name, description || null, logo_url || null, address || null, phone || null, email || null, website || null]
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

      return rows[0];
    } catch (error) {
      throw new Error(`Error fetching cafe: ${error.message}`);
    }
  }

  /**
   * Get cafe by slug
   */
  static async getBySlug(slug) {
    try {
      const [rows] = await pool.execute(
        'SELECT * FROM cafes WHERE slug = ? AND is_active = TRUE',
        [slug.toLowerCase()]
      );

      if (rows.length === 0) {
        return null;
      }

      return rows[0];
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
        'SELECT id, slug, name, description, logo_url, address, phone, email, website, is_active, created_at, updated_at FROM cafes ORDER BY name'
      );

      return rows;
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
    const { slug, name, description, logo_url, address, phone, email, website, is_active } = cafeData;

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

      return await this.getById(id);
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
