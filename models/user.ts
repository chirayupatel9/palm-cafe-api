import { pool } from '../config/database';
import bcrypt from 'bcryptjs';
import { RowDataPacket } from 'mysql2';

export interface UserRow {
  id: number;
  username: string;
  email: string;
  role: string;
  cafe_id?: number | null;
  created_at?: Date;
  last_login?: Date | null;
}

export interface UserCreateData {
  username: string;
  email: string;
  password: string;
  role?: string;
  cafe_id?: number | null;
}

class User {
  static async create(userData: UserCreateData): Promise<{ id: number; username: string; email: string; role: string; cafe_id: number | null }> {
    const { username, email, password, role = 'user', cafe_id } = userData;
    const hashedPassword = await bcrypt.hash(password, 10);
    const [columns] = await pool.execute<RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'cafe_id'`
    );
    const hasCafeId = columns.length > 0;
    if (hasCafeId && role !== 'superadmin' && cafe_id == null) {
      throw new Error('cafe_id is required for non-superadmin users');
    }
    let query: string;
    let params: (string | number | null)[];
    if (hasCafeId) {
      query = `INSERT INTO users (username, email, password, role, cafe_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())`;
      params = [username, email, hashedPassword, role, cafe_id ?? null];
    } else {
      query = `INSERT INTO users (username, email, password, role, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`;
      params = [username, email, hashedPassword, role];
    }
    const [result] = await pool.execute<{ insertId: number } & RowDataPacket[]>(query, params);
    return { id: result.insertId, username, email, role, cafe_id: cafe_id ?? null };
  }

  static async findByEmail(email: string): Promise<UserRow | null> {
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT * FROM users WHERE email = ?', [email]);
    return (rows[0] as UserRow) || null;
  }

  /** For verifying the logged-in user before sensitive superadmin actions */
  static async getPasswordHashById(id: number): Promise<string | null> {
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT password FROM users WHERE id = ?', [id]);
    if (!rows.length) {
      return null;
    }
    const p = (rows[0] as RowDataPacket).password;
    return p != null ? String(p) : null;
  }

  static async findById(id: number): Promise<UserRow | null> {
    const [columns] = await pool.execute<RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'cafe_id'`
    );
    const hasCafeId = columns.length > 0;
    const query = hasCafeId
      ? 'SELECT id, username, email, role, cafe_id, created_at FROM users WHERE id = ?'
      : 'SELECT id, username, email, role, created_at FROM users WHERE id = ?';
    const [rows] = await pool.execute<RowDataPacket[]>(query, [id]);
    const user = (rows[0] as UserRow) || null;
    if (user && !hasCafeId) (user as UserRow).cafe_id = null;
    return user;
  }

  static async findByIdWithCafe(id: number): Promise<(UserRow & { cafe_slug?: string | null; cafe_name?: string | null }) | null> {
    const [columns] = await pool.execute<RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'cafe_id'`
    );
    if (columns.length === 0) {
      const user = await this.findById(id);
      return user ? { ...user, cafe_id: null, cafe_slug: null, cafe_name: null } : null;
    }
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT u.id, u.username, u.email, u.role, u.cafe_id, u.created_at, c.slug as cafe_slug, c.name as cafe_name FROM users u LEFT JOIN cafes c ON u.cafe_id = c.id WHERE u.id = ?`,
      [id]
    );
    return (rows[0] as UserRow & { cafe_slug: string | null; cafe_name: string | null }) || null;
  }

  static async validatePassword(user: UserRow & { password?: string }, password: string): Promise<boolean> {
    if (!user || !('password' in user)) return false;
    return bcrypt.compare(password, (user as UserRow & { password: string }).password);
  }

  static async updateLastLogin(userId: number): Promise<void> {
    await pool.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [userId]);
  }

  static async getAll(cafeId: number | null = null): Promise<UserRow[]> {
    let query = 'SELECT id, username, email, role, cafe_id, created_at, last_login FROM users';
    const params: number[] = [];
    if (cafeId != null) {
      query += ' WHERE cafe_id = ?';
      params.push(cafeId);
    }
    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    return rows as UserRow[];
  }

  static async delete(id: number): Promise<boolean> {
    const [result] = await pool.execute<{ affectedRows: number } & RowDataPacket[]>('DELETE FROM users WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}

export default User;
