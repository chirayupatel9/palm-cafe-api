const { pool } = require('./config/database');
const Customer = require('./models/customer');
const Cafe = require('./models/cafe');

async function fixCustomerCafeIds() {
  try {
    console.log('Checking and fixing customer cafe_id values...\n');
    
    // Check if cafe_id column exists
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'customers' 
      AND COLUMN_NAME = 'cafe_id'
    `);
    
    if (columns.length === 0) {
      console.log('cafe_id column does not exist in customers table. Please run migration first.');
      return;
    }
    
    // Get all cafes
    const cafes = await Cafe.getAll();
    console.log(`Found ${cafes.length} cafes\n`);
    
    // Get all customers
    const [customers] = await pool.execute(`
      SELECT id, name, email, phone, cafe_id, created_at
      FROM customers
      ORDER BY created_at DESC
    `);
    
    console.log(`Found ${customers.length} customers\n`);
    
    // Check customers with NULL or wrong cafe_id
    const customersNeedingFix = customers.filter(c => !c.cafe_id);
    
    if (customersNeedingFix.length === 0) {
      console.log('✅ All customers have cafe_id set');
    } else {
      console.log(`⚠️  Found ${customersNeedingFix.length} customers without cafe_id\n`);
      
      // Assign to default cafe or first cafe
      const defaultCafe = cafes.find(c => c.slug === 'default') || cafes[0];
      
      if (!defaultCafe) {
        console.log('❌ No cafes found. Cannot assign cafe_id to customers.');
        return;
      }
      
      console.log(`Assigning customers to cafe: "${defaultCafe.name}" (ID: ${defaultCafe.id})\n`);
      
      for (const customer of customersNeedingFix) {
        console.log(`  Updating customer "${customer.name}" (ID: ${customer.id})`);
        await pool.execute(
          'UPDATE customers SET cafe_id = ? WHERE id = ?',
          [defaultCafe.id, customer.id]
        );
      }
      
      console.log(`\n✅ Fixed ${customersNeedingFix.length} customers`);
    }
    
    // Verify statistics for each cafe
    console.log('\n=== Verifying statistics ===');
    for (const cafe of cafes) {
      const stats = await Customer.getStatistics(cafe.id);
      const [cafeCustomers] = await pool.execute(
        'SELECT COUNT(*) as count FROM customers WHERE cafe_id = ?',
        [cafe.id]
      );
      
      console.log(`\nCafe: ${cafe.name} (ID: ${cafe.id})`);
      console.log(`  Customers in DB: ${cafeCustomers[0].count}`);
      console.log(`  Statistics - Total: ${stats.totalCustomers}, Active: ${stats.activeCustomers}`);
      console.log(`  Total Points: ${stats.totalLoyaltyPoints}, Total Spent: ${stats.totalSpent}`);
      
      if (cafeCustomers[0].count !== stats.totalCustomers) {
        console.log(`  ⚠️  WARNING: Count mismatch!`);
      }
    }
    
  } catch (error) {
    console.error('Error fixing customer cafe_ids:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

fixCustomerCafeIds();
