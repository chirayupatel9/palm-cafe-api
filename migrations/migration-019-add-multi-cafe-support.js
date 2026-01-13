const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Migration 019: Add Multi-Cafe Support
 * 
 * This migration:
 * 1. Creates the cafes table
 * 2. Adds cafeId to all cafe-related tables
 * 3. Creates default cafe for existing data
 * 4. Adds indexes for performance
 */
async function migrateMultiCafeSupport() {
  let connection;

  try {
    // Create database connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'cafe_app',
      port: process.env.DB_PORT || 3306
    });

    console.log('🔧 Starting multi-cafe support migration...');

    // Step 1: Create cafes table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS cafes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        logo_url VARCHAR(500),
        address TEXT,
        phone VARCHAR(50),
        email VARCHAR(200),
        website VARCHAR(200),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_slug (slug),
        INDEX idx_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Cafes table created');

    // Step 2: Check if default cafe exists, create if not
    const [existingCafes] = await connection.execute('SELECT id FROM cafes LIMIT 1');
    
    let defaultCafeId;
    if (existingCafes.length === 0) {
      // Create default cafe
      const [result] = await connection.execute(`
        INSERT INTO cafes (slug, name, description, is_active)
        VALUES ('default', 'Default Cafe', 'Default cafe for existing data', TRUE)
      `);
      defaultCafeId = result.insertId;
      console.log('✅ Default cafe created with ID:', defaultCafeId);
    } else {
      defaultCafeId = existingCafes[0].id;
      console.log('ℹ️  Using existing default cafe with ID:', defaultCafeId);
    }

    // Step 3: Add cafeId to users table
    const [usersColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'cafe_id'
    `);
    
    if (usersColumns.length === 0) {
      await connection.execute(`
        ALTER TABLE users 
        ADD COLUMN cafe_id INT
      `);
      
      await connection.execute(`
        ALTER TABLE users 
        ADD INDEX idx_cafe_id (cafe_id)
      `);
      
      await connection.execute(`
        ALTER TABLE users 
        ADD CONSTRAINT fk_users_cafe 
        FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE RESTRICT
      `).catch(() => {
        // Foreign key might already exist
      });
    }
    
    // Set default cafe for existing users
    await connection.execute(`
      UPDATE users SET cafe_id = ? WHERE cafe_id IS NULL
    `, [defaultCafeId]);
    console.log('✅ Added cafeId to users table');

    // Step 4: Add cafeId to menu_items table
    const [menuItemsColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'menu_items' 
      AND COLUMN_NAME = 'cafe_id'
    `);
    
    if (menuItemsColumns.length === 0) {
      await connection.execute(`
        ALTER TABLE menu_items 
        ADD COLUMN cafe_id INT
      `);
      
      await connection.execute(`
        ALTER TABLE menu_items 
        ADD INDEX idx_menu_items_cafe_id (cafe_id)
      `);
      
      await connection.execute(`
        ALTER TABLE menu_items 
        ADD CONSTRAINT fk_menu_items_cafe 
        FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE RESTRICT
      `).catch(() => {});
    }
    
    await connection.execute(`
      UPDATE menu_items SET cafe_id = ? WHERE cafe_id IS NULL
    `, [defaultCafeId]);
    console.log('✅ Added cafeId to menu_items table');

    // Step 5: Add cafeId to categories table
    const [categoriesColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'categories' 
      AND COLUMN_NAME = 'cafe_id'
    `);
    
    if (categoriesColumns.length === 0) {
      await connection.execute(`
        ALTER TABLE categories 
        ADD COLUMN cafe_id INT
      `);
      
      await connection.execute(`
        ALTER TABLE categories 
        ADD INDEX idx_categories_cafe_id (cafe_id)
      `);
      
      await connection.execute(`
        ALTER TABLE categories 
        ADD CONSTRAINT fk_categories_cafe 
        FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE RESTRICT
      `).catch(() => {});
    }
    
    await connection.execute(`
      UPDATE categories SET cafe_id = ? WHERE cafe_id IS NULL
    `, [defaultCafeId]);
    console.log('✅ Added cafeId to categories table');

    // Step 6: Add cafeId to orders table
    const [ordersColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'orders' 
      AND COLUMN_NAME = 'cafe_id'
    `);
    
    if (ordersColumns.length === 0) {
      await connection.execute(`
        ALTER TABLE orders 
        ADD COLUMN cafe_id INT
      `);
      
      await connection.execute(`
        ALTER TABLE orders 
        ADD INDEX idx_orders_cafe_id (cafe_id)
      `);
      
      await connection.execute(`
        ALTER TABLE orders 
        ADD CONSTRAINT fk_orders_cafe 
        FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE RESTRICT
      `).catch(() => {});
    }
    
    await connection.execute(`
      UPDATE orders SET cafe_id = ? WHERE cafe_id IS NULL
    `, [defaultCafeId]);
    console.log('✅ Added cafeId to orders table');

    // Step 7: Add cafeId to invoices table
    const [invoicesColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'invoices' 
      AND COLUMN_NAME = 'cafe_id'
    `);
    
    if (invoicesColumns.length === 0) {
      await connection.execute(`
        ALTER TABLE invoices 
        ADD COLUMN cafe_id INT
      `);
      
      await connection.execute(`
        ALTER TABLE invoices 
        ADD INDEX idx_invoices_cafe_id (cafe_id)
      `);
      
      await connection.execute(`
        ALTER TABLE invoices 
        ADD CONSTRAINT fk_invoices_cafe 
        FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE RESTRICT
      `).catch(() => {});
    }
    
    await connection.execute(`
      UPDATE invoices SET cafe_id = ? WHERE cafe_id IS NULL
    `, [defaultCafeId]);
    console.log('✅ Added cafeId to invoices table');

    // Step 8: Add cafeId to customers table
    const [customersColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'customers' 
      AND COLUMN_NAME = 'cafe_id'
    `);
    
    if (customersColumns.length === 0) {
      await connection.execute(`
        ALTER TABLE customers 
        ADD COLUMN cafe_id INT
      `);
      
      await connection.execute(`
        ALTER TABLE customers 
        ADD INDEX idx_customers_cafe_id (cafe_id)
      `);
      
      await connection.execute(`
        ALTER TABLE customers 
        ADD CONSTRAINT fk_customers_cafe 
        FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE RESTRICT
      `).catch(() => {});
    }
    
    await connection.execute(`
      UPDATE customers SET cafe_id = ? WHERE cafe_id IS NULL
    `, [defaultCafeId]);
    console.log('✅ Added cafeId to customers table');

    // Step 9: Add cafeId to inventory table (if exists)
    try {
      const [inventoryTable] = await connection.execute(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'inventory'
      `);
      
      if (inventoryTable.length > 0) {
        const [inventoryColumns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'inventory' 
          AND COLUMN_NAME = 'cafe_id'
        `);
        
        if (inventoryColumns.length === 0) {
          await connection.execute(`
            ALTER TABLE inventory 
            ADD COLUMN cafe_id INT
          `);
          
          await connection.execute(`
            ALTER TABLE inventory 
            ADD INDEX idx_inventory_cafe_id (cafe_id)
          `);
          
          await connection.execute(`
            ALTER TABLE inventory 
            ADD CONSTRAINT fk_inventory_cafe 
            FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE RESTRICT
          `).catch(() => {});
        }
        
        await connection.execute(`
          UPDATE inventory SET cafe_id = ? WHERE cafe_id IS NULL
        `, [defaultCafeId]);
        console.log('✅ Added cafeId to inventory table');
      }
    } catch (error) {
      console.log('ℹ️  Inventory table does not exist, skipping');
    }

    // Step 10: Add cafeId to cafe_settings table
    try {
      const [cafeSettingsTable] = await connection.execute(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'cafe_settings'
      `);
      
      if (cafeSettingsTable.length > 0) {
        const [cafeSettingsColumns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'cafe_settings' 
          AND COLUMN_NAME = 'cafe_id'
        `);
        
        if (cafeSettingsColumns.length === 0) {
          await connection.execute(`
            ALTER TABLE cafe_settings 
            ADD COLUMN cafe_id INT
          `);
          
          await connection.execute(`
            ALTER TABLE cafe_settings 
            ADD INDEX idx_cafe_settings_cafe_id (cafe_id)
          `);
          
          await connection.execute(`
            ALTER TABLE cafe_settings 
            ADD CONSTRAINT fk_cafe_settings_cafe 
            FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE RESTRICT
          `).catch(() => {});
        }
        
        await connection.execute(`
          UPDATE cafe_settings SET cafe_id = ? WHERE cafe_id IS NULL
        `, [defaultCafeId]);
        console.log('✅ Added cafeId to cafe_settings table');
      }
    } catch (error) {
      console.log('ℹ️  cafe_settings table does not exist, skipping');
    }

    // Step 11: Add cafeId to payment_methods table (if exists)
    try {
      const [paymentMethodsTable] = await connection.execute(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'payment_methods'
      `);
      
      if (paymentMethodsTable.length > 0) {
        const [paymentMethodsColumns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'payment_methods' 
          AND COLUMN_NAME = 'cafe_id'
        `);
        
        if (paymentMethodsColumns.length === 0) {
          await connection.execute(`
            ALTER TABLE payment_methods 
            ADD COLUMN cafe_id INT
          `);
          
          await connection.execute(`
            ALTER TABLE payment_methods 
            ADD INDEX idx_payment_methods_cafe_id (cafe_id)
          `);
          
          await connection.execute(`
            ALTER TABLE payment_methods 
            ADD CONSTRAINT fk_payment_methods_cafe 
            FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE RESTRICT
          `).catch(() => {});
        }
        
        await connection.execute(`
          UPDATE payment_methods SET cafe_id = ? WHERE cafe_id IS NULL
        `, [defaultCafeId]);
        console.log('✅ Added cafeId to payment_methods table');
      }
    } catch (error) {
      console.log('ℹ️  payment_methods table does not exist, skipping');
    }

    // Step 12: Add cafeId to tax_settings table (if exists)
    try {
      const [taxSettingsTable] = await connection.execute(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tax_settings'
      `);
      
      if (taxSettingsTable.length > 0) {
        const [taxSettingsColumns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tax_settings' 
          AND COLUMN_NAME = 'cafe_id'
        `);
        
        if (taxSettingsColumns.length === 0) {
          await connection.execute(`
            ALTER TABLE tax_settings 
            ADD COLUMN cafe_id INT
          `);
          
          await connection.execute(`
            ALTER TABLE tax_settings 
            ADD INDEX idx_tax_settings_cafe_id (cafe_id)
          `);
          
          await connection.execute(`
            ALTER TABLE tax_settings 
            ADD CONSTRAINT fk_tax_settings_cafe 
            FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE RESTRICT
          `).catch(() => {});
        }
        
        await connection.execute(`
          UPDATE tax_settings SET cafe_id = ? WHERE cafe_id IS NULL
        `, [defaultCafeId]);
        console.log('✅ Added cafeId to tax_settings table');
      }
    } catch (error) {
      console.log('ℹ️  tax_settings table does not exist, skipping');
    }

    // Step 13: Add cafeId to currency_settings table (if exists)
    try {
      const [currencySettingsTable] = await connection.execute(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'currency_settings'
      `);
      
      if (currencySettingsTable.length > 0) {
        const [currencySettingsColumns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'currency_settings' 
          AND COLUMN_NAME = 'cafe_id'
        `);
        
        if (currencySettingsColumns.length === 0) {
          await connection.execute(`
            ALTER TABLE currency_settings 
            ADD COLUMN cafe_id INT
          `);
          
          await connection.execute(`
            ALTER TABLE currency_settings 
            ADD INDEX idx_currency_settings_cafe_id (cafe_id)
          `);
          
          await connection.execute(`
            ALTER TABLE currency_settings 
            ADD CONSTRAINT fk_currency_settings_cafe 
            FOREIGN KEY (cafe_id) REFERENCES cafes(id) ON DELETE RESTRICT
          `).catch(() => {});
        }
        
        await connection.execute(`
          UPDATE currency_settings SET cafe_id = ? WHERE cafe_id IS NULL
        `, [defaultCafeId]);
        console.log('✅ Added cafeId to currency_settings table');
      }
    } catch (error) {
      console.log('ℹ️  currency_settings table does not exist, skipping');
    }

    console.log('🎉 Multi-cafe support migration completed successfully!');
    console.log(`📝 Default cafe ID: ${defaultCafeId}`);
    console.log('⚠️  IMPORTANT: Update existing cafes with proper slugs and names');

  } catch (error) {
    console.error('❌ Error during multi-cafe support migration:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateMultiCafeSupport()
    .then(() => {
      console.log('✅ Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = migrateMultiCafeSupport;
