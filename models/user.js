const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  static async create(userData) {
    const { username, email, password, role = 'user', cafe_id } = userData;
    
    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Check if cafe_id column exists
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'cafe_id'
    `);
    
    const hasCafeId = columns.length > 0;
    
    // Super Admin doesn't need cafe_id, but all other roles do (if column exists)
    if (hasCafeId && role !== 'superadmin' && !cafe_id) {
      throw new Error('cafe_id is required for non-superadmin users');
    }
    
    let query, params;
    if (hasCafeId) {
      query = `
        INSERT INTO users (username, email, password, role, cafe_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NOW(), NOW())
      `;
      params = [username, email, hashedPassword, role, cafe_id || null];
    } else {
      query = `
        INSERT INTO users (username, email, password, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, NOW(), NOW())
      `;
      params = [username, email, hashedPassword, role];
    }
    
    try {
      const [result] = await pool.execute(query, params);
      return { id: result.insertId, username, email, role, cafe_id: cafe_id || null };
    } catch (error) {
      throw error;
    }
  }

  static async findByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = ?';
    
    try {
      const [rows] = await pool.execute(query, [email]);
      return rows[0] || null;
    } catch (error) {
      throw error;
    }
  }

  static async findById(id) {
    try {
      // Check if cafe_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      const hasCafeId = columns.length > 0;
      
      const query = hasCafeId 
        ? 'SELECT id, username, email, role, cafe_id, created_at FROM users WHERE id = ?'
        : 'SELECT id, username, email, role, created_at FROM users WHERE id = ?';
      
      const [rows] = await pool.execute(query, [id]);
      const user = rows[0] || null;
      
      // Add cafe_id as null if column doesn't exist
      if (user && !hasCafeId) {
        user.cafe_id = null;
      }
      
      return user;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get user with cafe information
   * Handles case where cafe_id column doesn't exist yet (before migration)
   */
  static async findByIdWithCafe(id) {
    try {
      // First check if cafe_id column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      if (columns.length === 0) {
        // cafe_id column doesn't exist yet, return user without cafe info
        const user = await this.findById(id);
        return user ? { ...user, cafe_id: null, cafe_slug: null, cafe_name: null } : null;
      }
      
      // cafe_id exists, join with cafes table
      const query = `
        SELECT u.id, u.username, u.email, u.role, u.cafe_id, u.created_at,
               c.slug as cafe_slug, c.name as cafe_name
        FROM users u
        LEFT JOIN cafes c ON u.cafe_id = c.id
        WHERE u.id = ?
      `;
      
      const [rows] = await pool.execute(query, [id]);
      return rows[0] || null;
    } catch (error) {
      // Fallback to basic user query if join fails
      const user = await this.findById(id);
      return user ? { ...user, cafe_id: null, cafe_slug: null, cafe_name: null } : null;
    }
  }

  static async validatePassword(user, password) {
    return await bcrypt.compare(password, user.password);
  }

  static async updateLastLogin(userId) {
    const query = 'UPDATE users SET last_login = NOW() WHERE id = ?';
    
    try {
      await pool.execute(query, [userId]);
    } catch (error) {
      throw error;
    }
  }

  static async getAll(cafeId = null) {
    let query = 'SELECT id, username, email, role, cafe_id, created_at, last_login FROM users';
    const params = [];
    
    if (cafeId) {
      query += ' WHERE cafe_id = ?';
      params.push(cafeId);
    }
    
    query += ' ORDER BY created_at DESC';
    
    try {
      const [rows] = await pool.execute(query, params);
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async delete(id) {
    const query = 'DELETE FROM users WHERE id = ?';
    
    try {
      const [result] = await pool.execute(query, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = User; 