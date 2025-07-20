const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  static async create(userData) {
    const { username, email, password, role = 'user' } = userData;
    
    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    const query = `
      INSERT INTO users (username, email, password, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, NOW(), NOW())
    `;
    
    try {
      const [result] = await pool.execute(query, [username, email, hashedPassword, role]);
      return { id: result.insertId, username, email, role };
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
    const query = 'SELECT id, username, email, role, created_at FROM users WHERE id = ?';
    
    try {
      const [rows] = await pool.execute(query, [id]);
      return rows[0] || null;
    } catch (error) {
      throw error;
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

  static async getAll() {
    const query = 'SELECT id, username, email, role, created_at, last_login FROM users ORDER BY created_at DESC';
    
    try {
      const [rows] = await pool.execute(query);
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