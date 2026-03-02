/**
 * Unit tests for Customer model. Database pool mocked.
 */
const mockExecute = jest.fn();
jest.mock('../../../config/database', () => ({
  pool: { execute: (...args) => mockExecute(...args) }
}));

const Customer = require('../../../models/customer');

function mockConn() {
  return { execute: mockExecute };
}

describe('Customer model', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  describe('getAll', () => {
    it('returns customers with cafeId and limit/offset', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ id: 1, name: 'A', loyalty_points: 10, total_spent: 100, visit_count: 2 }]]);
      const result = await Customer.getAll(1, { limit: 10, offset: 0 });
      expect(result).toHaveLength(1);
      expect(result[0].loyalty_points).toBe(10);
      expect(result[0].total_spent).toBe(100);
      expect(result[0].visit_count).toBe(2);
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('WHERE cafe_id = ?'), [1]);
    });
    it('returns empty when hasCafeId but no cafeId', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]);
      const result = await Customer.getAll(null);
      expect(result).toEqual([]);
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
    it('throws on DB error', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]).mockRejectedValueOnce(new Error('db'));
      await expect(Customer.getAll(1)).rejects.toThrow('Error fetching customers');
    });
  });

  describe('getById', () => {
    it('returns null when not found', async () => {
      mockExecute.mockResolvedValue([[]]);
      const result = await Customer.getById(999);
      expect(result).toBeNull();
    });
    it('returns customer with cafeId', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, name: 'B', loyalty_points: 5, total_spent: 50, visit_count: 1 }]]);
      const result = await Customer.getById(1, 2);
      expect(result.id).toBe(1);
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('AND cafe_id = ?'), [1, 2]);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('db'));
      await expect(Customer.getById(1)).rejects.toThrow('Error fetching customer');
    });
  });

  describe('findByEmailOrPhone', () => {
    it('returns customer when found with cafeId', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ id: 1, name: 'C', loyalty_points: 0, total_spent: 0, visit_count: 0 }]]);
      const result = await Customer.findByEmailOrPhone('a@b.com', '+123', 1);
      expect(result).not.toBeNull();
      expect(result.id).toBe(1);
    });
    it('returns null when hasCafeId but no cafeId', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]);
      const result = await Customer.findByEmailOrPhone('a@b.com', '+123', null);
      expect(result).toBeNull();
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
    it('returns null when no rows', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]).mockResolvedValueOnce([[]]);
      const result = await Customer.findByEmailOrPhone('x@y.com', '+999', 1);
      expect(result).toBeNull();
    });
    it('throws on DB error', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]).mockRejectedValue(new Error('db'));
      await expect(Customer.findByEmailOrPhone('a', 'b', 1)).rejects.toThrow('Error finding customer');
    });
  });

  describe('create', () => {
    it('inserts with cafe_id and returns getById result', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([{ insertId: 50 }])
        .mockResolvedValueOnce([[{ id: 50, name: 'D', loyalty_points: 0, total_spent: 0, visit_count: 0 }]]);
      const result = await Customer.create({
        name: 'D', email: 'd@e.com', phone: '+1', address: null, date_of_birth: null, notes: null, cafe_id: 1
      });
      expect(result.id).toBe(50);
      expect(mockExecute).toHaveBeenNthCalledWith(2, expect.stringContaining('cafe_id'), expect.arrayContaining([1]));
    });
    it('throws when cafe_id missing but hasCafeId', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]);
      await expect(Customer.create({
        name: 'X', email: null, phone: null, address: null, date_of_birth: null, notes: null
      })).rejects.toThrow('cafe_id is required');
    });
    it('uses legacy insert when no cafe_id column', async () => {
      mockExecute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ insertId: 60 }])
        .mockResolvedValueOnce([[{ id: 60, name: 'E', loyalty_points: 0, total_spent: 0, visit_count: 0 }]]);
      const result = await Customer.create({
        name: 'E', email: null, phone: null, address: null, date_of_birth: null, notes: null
      });
      expect(result.id).toBe(60);
      expect(mockExecute).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO customers'), expect.arrayContaining(['E']));
    });
    it('throws on DB error', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]).mockRejectedValue(new Error('db'));
      await expect(Customer.create({
        name: 'F', email: null, phone: null, address: null, date_of_birth: null, notes: null, cafe_id: 1
      })).rejects.toThrow('Error creating customer');
    });
  });

  describe('update', () => {
    it('updates and returns getById result', async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ id: 1, name: 'Updated', loyalty_points: 0, total_spent: 0, visit_count: 0 }]]);
      const result = await Customer.update(1, {
        name: 'Updated', email: null, phone: null, address: null, date_of_birth: null, notes: null, is_active: true
      }, 1);
      expect(result.name).toBe('Updated');
    });
    it('throws when affectedRows 0', async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      await expect(Customer.update(999, {
        name: 'X', email: null, phone: null, address: null, date_of_birth: null, notes: null, is_active: true
      })).rejects.toThrow('Customer not found');
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('db'));
      await expect(Customer.update(1, {
        name: 'X', email: null, phone: null, address: null, date_of_birth: null, notes: null, is_active: true
      })).rejects.toThrow('Error updating customer');
    });
  });

  describe('updateLoyaltyData', () => {
    it('updates with pointsChange and returns getById', async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ id: 1, loyalty_points: 15, total_spent: 100, visit_count: 2 }]]);
      const result = await Customer.updateLoyaltyData(1, 100, 5, 1);
      expect(result).not.toBeNull();
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('loyalty_points + ?'), [5, 100, 1, 1]);
    });
    it('calculates points from orderAmount when pointsChange null', async () => {
      mockExecute
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ id: 1 }]]);
      await Customer.updateLoyaltyData(1, 25, null, 1);
      expect(mockExecute).toHaveBeenCalledWith(expect.any(String), [2, 25, 1, 1]);
    });
    it('throws when affectedRows 0', async () => {
      mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
      await expect(Customer.updateLoyaltyData(999, 10, null)).rejects.toThrow('Customer not found');
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('db'));
      await expect(Customer.updateLoyaltyData(1, 10)).rejects.toThrow('Error updating customer loyalty data');
    });
  });

  describe('getOrderHistory', () => {
    it('returns grouped orders with items', async () => {
      mockExecute.mockResolvedValue([[
        { id: 1, order_number: 'ORD1', total_amount: 20, final_amount: 20, status: 'completed', payment_method: 'cash', created_at: new Date(), item_name: 'Coffee', quantity: 2, unit_price: 10, total_price: 20 },
        { id: 1, order_number: 'ORD1', total_amount: 20, final_amount: 20, status: 'completed', payment_method: 'cash', created_at: new Date(), item_name: 'Tea', quantity: 1, unit_price: 5, total_price: 5 }
      ]]);
      const result = await Customer.getOrderHistory(1, 1);
      expect(result).toHaveLength(1);
      expect(result[0].items).toHaveLength(2);
    });
    it('returns orders without cafeId', async () => {
      mockExecute.mockResolvedValue([[]]);
      const result = await Customer.getOrderHistory(1);
      expect(result).toEqual([]);
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('customer_id = ?'), [1]);
    });
    it('handles row with no item_name', async () => {
      mockExecute.mockResolvedValue([[{ id: 1, order_number: 'ORD1', total_amount: 0, final_amount: 0, status: 'pending', payment_method: null, created_at: new Date(), item_name: null, quantity: null, unit_price: null, total_price: null }]]);
      const result = await Customer.getOrderHistory(1, 1);
      expect(result[0].items).toHaveLength(0);
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('db'));
      await expect(Customer.getOrderHistory(1)).rejects.toThrow('Error fetching customer order history');
    });
  });

  describe('search', () => {
    it('returns customers for query with cafeId', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ id: 1, name: 'Alice', loyalty_points: 0, total_spent: 0, visit_count: 0 }]]);
      const result = await Customer.search('alice', 1);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alice');
    });
    it('returns empty when hasCafeId but no cafeId', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]);
      const result = await Customer.search('x', null);
      expect(result).toEqual([]);
    });
    it('throws on DB error', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]).mockRejectedValue(new Error('db'));
      await expect(Customer.search('q', 1)).rejects.toThrow('Error searching customers');
    });
  });

  describe('getStatistics', () => {
    it('returns stats for cafeId', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]])
        .mockResolvedValueOnce([[{ count: 10 }]])
        .mockResolvedValueOnce([[{ count: 8 }]])
        .mockResolvedValueOnce([[{ total: 500 }]])
        .mockResolvedValueOnce([[{ total: 1000 }]])
        .mockResolvedValueOnce([[{ average: 100 }]])
        .mockResolvedValueOnce([[{ name: 'A', total_spent: 200, loyalty_points: 20, visit_count: 5 }]]);
      const result = await Customer.getStatistics(1);
      expect(result.totalCustomers).toBe(10);
      expect(result.activeCustomers).toBe(8);
      expect(result.totalLoyaltyPoints).toBe(500);
      expect(result.totalSpent).toBe(1000);
      expect(result.averageSpent).toBe(100);
      expect(result.topCustomers).toHaveLength(1);
    });
    it('returns empty stats when hasCafeId but no cafeId', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]);
      const result = await Customer.getStatistics(null);
      expect(result).toEqual({
        totalCustomers: 0,
        activeCustomers: 0,
        totalLoyaltyPoints: 0,
        totalSpent: 0,
        averageSpent: 0,
        topCustomers: []
      });
    });
    it('returns stats when no cafe_id column (legacy)', async () => {
      mockExecute
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ count: 5 }]])
        .mockResolvedValueOnce([[{ count: 4 }]])
        .mockResolvedValueOnce([[{ total: 100 }]])
        .mockResolvedValueOnce([[{ total: 500 }]])
        .mockResolvedValueOnce([[{ average: 100 }]])
        .mockResolvedValueOnce([[]]);
      const result = await Customer.getStatistics(null);
      expect(result.totalCustomers).toBe(5);
      expect(result.activeCustomers).toBe(4);
      expect(result.topCustomers).toEqual([]);
    });
    it('throws on DB error', async () => {
      mockExecute.mockResolvedValueOnce([[{ COLUMN_NAME: 'cafe_id' }]]).mockRejectedValue(new Error('db'));
      await expect(Customer.getStatistics(1)).rejects.toThrow('Error fetching customer statistics');
    });
  });

  describe('redeemPoints', () => {
    it('reduces points and returns customer', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ id: 1, loyalty_points: 50, total_spent: 0, visit_count: 0 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ id: 1, loyalty_points: 30 }]]);
      const result = await Customer.redeemPoints(1, 20, 1);
      expect(result).not.toBeNull();
      expect(mockExecute).toHaveBeenNthCalledWith(2, expect.stringContaining('loyalty_points - ?'), [20, 1, 1]);
    });
    it('throws when customer not found', async () => {
      mockExecute.mockResolvedValueOnce([[]]);
      await expect(Customer.redeemPoints(999, 10)).rejects.toThrow('Customer not found');
    });
    it('throws when insufficient points', async () => {
      mockExecute.mockResolvedValueOnce([[{ id: 1, loyalty_points: 5, total_spent: 0, visit_count: 0 }]]);
      await expect(Customer.redeemPoints(1, 20)).rejects.toThrow('Insufficient loyalty points');
    });
    it('throws when affectedRows 0 on update', async () => {
      mockExecute
        .mockResolvedValueOnce([[{ id: 1, loyalty_points: 50 }]])
        .mockResolvedValueOnce([{ affectedRows: 0 }]);
      await expect(Customer.redeemPoints(1, 20)).rejects.toThrow('Failed to redeem points');
    });
    it('throws on DB error', async () => {
      mockExecute.mockRejectedValue(new Error('db'));
      await expect(Customer.redeemPoints(1, 10)).rejects.toThrow('Error redeeming loyalty points');
    });
  });
});
