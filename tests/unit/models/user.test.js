/**
 * Unit tests for User model. DB mocked.
 */
const mockExecute = jest.fn();
jest.mock('../../../config/database', () => ({
  pool: { execute: (...args) => mockExecute(...args) }
}));

const User = require('../../../models/user');

describe('User model', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  describe('findByEmail', () => {
    it('returns user when found', async () => {
      const row = { id: 1, email: 'a@b.com', username: 'a', password: 'hash', role: 'admin' };
      mockExecute.mockResolvedValue([[row]]);
      const result = await User.findByEmail('a@b.com');
      expect(result).toEqual(row);
      expect(mockExecute).toHaveBeenCalledWith('SELECT * FROM users WHERE email = ?', ['a@b.com']);
    });
    it('returns null when not found', async () => {
      mockExecute.mockResolvedValue([[]]);
      const result = await User.findByEmail('nobody@x.com');
      expect(result).toBeNull();
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('DB fail'));
      await expect(User.findByEmail('a@b.com')).rejects.toThrow('DB fail');
    });
  });

  describe('findById', () => {
    it('returns user with cafe_id when column exists', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ id: 1, username: 'u', email: 'u@x.com', role: 'user', cafe_id: 5 }]]);
      const result = await User.findById(1);
      expect(result.cafe_id).toBe(5);
    });
    it('returns user with cafe_id null when column does not exist', async () => {
      mockExecute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ id: 1, username: 'u', email: 'u@x.com', role: 'user' }]]);
      const result = await User.findById(1);
      expect(result.cafe_id).toBeNull();
    });
    it('returns null when not found', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]).mockResolvedValueOnce([[]]);
      const result = await User.findById(999);
      expect(result).toBeNull();
    });
  });

  describe('findByIdWithCafe', () => {
    it('returns user with cafe fields when cafe_id column exists', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ id: 1, username: 'u', email: 'u@x.com', role: 'user', cafe_id: 1, cafe_slug: 'my-cafe', cafe_name: 'My Cafe' }]]);
      const result = await User.findByIdWithCafe(1);
      expect(result.cafe_slug).toBe('my-cafe');
      expect(result.cafe_name).toBe('My Cafe');
    });
    it('returns user with null cafe fields when cafe_id column does not exist', async () => {
      mockExecute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ id: 1, username: 'u', email: 'u@x.com', role: 'user' }]]);
      const result = await User.findByIdWithCafe(1);
      expect(result.cafe_id).toBeNull();
      expect(result.cafe_slug).toBeNull();
      expect(result.cafe_name).toBeNull();
    });
    it('returns null when user not found', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]).mockResolvedValueOnce([[]]);
      const result = await User.findByIdWithCafe(999);
      expect(result).toBeNull();
    });
    it('falls back to findById when join fails', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockRejectedValueOnce(new Error('join fail'))
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ id: 1, username: 'u', email: 'u@x.com', role: 'user' }]]);
      const result = await User.findByIdWithCafe(1);
      expect(result).toHaveProperty('cafe_id', null);
    });
  });

  describe('validatePassword', () => {
    it('returns true when password matches', async () => {
      const user = { password: '$2a$10$hashed' };
      const bcrypt = require('bcryptjs');
      bcrypt.compare = jest.fn().mockResolvedValue(true);
      const result = await User.validatePassword(user, 'secret');
      expect(result).toBe(true);
    });
    it('returns false when password does not match', async () => {
      const bcrypt = require('bcryptjs');
      bcrypt.compare = jest.fn().mockResolvedValue(false);
      const result = await User.validatePassword({ password: 'hash' }, 'wrong');
      expect(result).toBe(false);
    });
  });

  describe('updateLastLogin', () => {
    it('executes update query', async () => {
      mockExecute.mockResolvedValue([]);
      await User.updateLastLogin(1);
      expect(mockExecute).toHaveBeenCalledWith('UPDATE users SET last_login = NOW() WHERE id = ?', [1]);
    });
  });

  describe('getAll', () => {
    it('returns rows without filter when cafeId null', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, username: 'a' }]]);
      const result = await User.getAll();
      expect(result).toHaveLength(1);
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('SELECT'), []);
    });
    it('filters by cafe_id when provided', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, cafe_id: 5 }]]);
      await User.getAll(5);
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('WHERE cafe_id = ?'), [5]);
    });
  });

  describe('delete', () => {
    it('returns true when row deleted', async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
      const result = await User.delete(1);
      expect(result).toBe(true);
    });
    it('returns false when no row matched', async () => {
      mockExecute.mockResolvedValue([{ affectedRows: 0 }]);
      const result = await User.delete(999);
      expect(result).toBe(false);
    });
  });
});
