const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { initializeDatabase, testConnection } = require('./config/database');
const MenuItem = require('./models/menuItem');
const Category = require('./models/category');
const Invoice = require('./models/invoice');
const TaxSettings = require('./models/taxSettings');
const CurrencySettings = require('./models/currencySettings');
const User = require('./models/user');
const { auth, adminAuth, JWT_SECRET } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0'; // Allow network access

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Generate PDF invoice
const generatePDF = async (invoice) => {
  // Get current currency settings with better error handling
  let currencySymbol = '₹'; // Default to INR symbol
  try {
    const currencySettings = await CurrencySettings.getCurrent();
    console.log('Currency settings for PDF:', JSON.stringify(currencySettings, null, 2));
    
    if (currencySettings && currencySettings.currency_symbol) {
      const symbol = String(currencySettings.currency_symbol).trim();
      if (symbol && symbol.length > 0) {
        currencySymbol = symbol;
      }
    }
    
    console.log('Final currency symbol being used:', currencySymbol);
  } catch (error) {
    console.error('Error fetching currency settings for PDF:', error);
    console.log('Using fallback currency symbol:', currencySymbol);
  }

  // Helper function to format currency with symbol
  const formatCurrency = (amount) => {
    const num = parseFloat(amount || 0).toFixed(2);
    
    // Map Unicode symbols to ASCII equivalents for PDF compatibility
    let symbol = currencySymbol;
    if (currencySymbol === '₹') {
      symbol = 'Rs.';
    } else if (currencySymbol === '€') {
      symbol = 'EUR';
    } else if (currencySymbol === '£') {
      symbol = 'GBP';
    } else if (currencySymbol === '¥') {
      symbol = 'JPY';
    }
    
    const formatted = `${symbol}${num}`;
    console.log(`Formatting currency: ${amount} -> ${formatted} (original symbol: ${currencySymbol}, used symbol: ${symbol})`);
    return formatted;
  };

  return new Promise((resolve) => {
    const doc = new PDFDocument({ 
      margin: 20, // Reduced margins
      size: 'A4',
      autoFirstPage: true
    });
    
    // Set default font that supports Unicode
    doc.font('Helvetica');
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const result = Buffer.concat(chunks);
      resolve(result.toString('base64'));
    });

    // Calculate page dimensions
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 40; // Reduced margins
    const contentWidth = pageWidth - (margin * 2);

    // Header background - more readable
    doc.rect(0, 0, pageWidth, 70).fill('#f4e1ba'); // Increased height for better spacing
    
    // Logo in header - left side, bigger
    try {
      doc.image('./public/images/palm-cafe-logo.png', margin, 10, { width: 50, height: 50 }); // Much larger logo on left
    } catch (error) {
      console.error('Error adding logo to PDF:', error);
      // Fallback to drawn logo
      doc.circle(margin + 25, 35, 25).fill('#153059'); // Larger circle on left
      doc.circle(margin + 25, 35, 25).stroke('#f4e1ba').lineWidth(2);
      doc.fontSize(8).font('Helvetica-Bold').fill('#f4e1ba').text('PALM', margin + 25, 30, { align: 'center' });
      doc.fontSize(6).font('Helvetica').text('CAFE', margin + 25, 40, { align: 'center' });
    }

    // Business name - right side
    doc.fontSize(20).font('Helvetica-Bold').fill('#153059').text('PALM CAFE', margin + 380, 25, { width: 200 }); // Bold font on right side
    
    // Invoice title
    doc.fontSize(14).font('Helvetica-Bold').fill('#75826b').text('INVOICE', 0, 85, { align: 'center', width: pageWidth }); // Larger font
    
    // Invoice and customer info - better spacing
    let currentY = 110; // Better spacing from header
    
    // Left column - Invoice details
    doc.fontSize(11).font('Helvetica-Bold').fill('#153059').text('Invoice #:', margin, currentY);
    doc.fontSize(11).font('Helvetica').text(invoice.invoice_number || invoice.invoiceNumber || 'N/A', margin + 70, currentY);
    
    doc.fontSize(9).font('Helvetica').text(`Date: ${new Date(invoice.date).toLocaleDateString()}`, margin, currentY + 15);
    doc.fontSize(9).font('Helvetica').text(`Time: ${new Date(invoice.date).toLocaleTimeString()}`, margin, currentY + 25);
    
    // Right column - Customer details
    doc.fontSize(11).font('Helvetica-Bold').fill('#153059').text('Customer:', margin + 300, currentY);
    doc.fontSize(11).font('Helvetica').text(invoice.customerName || invoice.customer_name || 'Walk-in Customer', margin + 370, currentY);
    
    if (invoice.customerPhone || invoice.customer_phone) {
      doc.fontSize(9).font('Helvetica').text(`Phone: ${invoice.customerPhone || invoice.customer_phone}`, margin + 300, currentY + 15);
    }

    // Items table
    currentY += 40; // Better spacing
    
    // Table header - more readable
    doc.roundedRect(margin, currentY, contentWidth, 20, 5).fill('#f4e1ba'); // Larger height
    doc.fontSize(10).font('Helvetica-Bold').fill('#153059'); // Larger font
    doc.text('Item', margin + 10, currentY + 6, { width: 200 }); // Better Y position
    doc.text('Qty', margin + 220, currentY + 6, { width: 60, align: 'right' });
    doc.text('Price', margin + 290, currentY + 6, { width: 80, align: 'right' });
    doc.text('Total', margin + 380, currentY + 6, { width: 80, align: 'right' });

    // Table rows - more readable
    currentY += 20; // Better spacing
    (invoice.items || []).forEach((item, idx) => {
      // Check if we need a new page - more conservative check
      if (currentY > pageHeight - 120) {
        doc.addPage();
        currentY = margin + 50;
      }
      
      // Zebra striping
      const rowColor = idx % 2 === 0 ? '#f8f8f8' : '#ffffff';
      doc.rect(margin, currentY, contentWidth, 16).fill(rowColor); // Larger row height
      
      doc.fontSize(9).font('Helvetica').fill('#153059'); // Larger font
      doc.text(item.name || item.item_name || 'Unknown Item', margin + 10, currentY + 4, { width: 200 }); // Better Y position
      doc.text(item.quantity.toString(), margin + 220, currentY + 4, { width: 60, align: 'right' });
      doc.text(formatCurrency(item.price), margin + 290, currentY + 4, { width: 80, align: 'right' });
      doc.text(formatCurrency(item.total), margin + 380, currentY + 4, { width: 80, align: 'right' });
      
      currentY += 16; // Better spacing
    });

    // Totals section - more readable
    currentY += 10; // Better spacing
    
    // Check if we need a new page for totals - more conservative check
    if (currentY > pageHeight - 100) {
      doc.addPage();
      currentY = margin + 50;
    }
    
    doc.fontSize(11).font('Helvetica-Bold').fill('#75826b'); // Larger font
    doc.text('Subtotal:', margin + 290, currentY, { width: 80, align: 'right' });
    doc.text(formatCurrency(invoice.subtotal), margin + 380, currentY, { width: 80, align: 'right' });
    currentY += 15; // Better spacing
    
    if (parseFloat(invoice.tax_amount || 0) > 0) {
      doc.text('Tax:', margin + 290, currentY, { width: 80, align: 'right' });
      doc.text(formatCurrency(invoice.tax_amount), margin + 380, currentY, { width: 80, align: 'right' });
      currentY += 15; // Better spacing
    }
    
    if (parseFloat(invoice.tip_amount || 0) > 0) {
      doc.text('Tip:', margin + 290, currentY, { width: 80, align: 'right' });
      doc.text(formatCurrency(invoice.tip_amount), margin + 380, currentY, { width: 80, align: 'right' });
      currentY += 15; // Better spacing
    }
    
    // Total row with accent background - properly aligned
    doc.roundedRect(margin, currentY, contentWidth, 20, 5).fill('#75826b');
    // doc.roundedRect(margin + 280, currentY, 180, 20, 5).fill('#75826b'); // Larger height
    doc.fontSize(12).font('Helvetica-Bold').fill('#ffffff'); // Larger font
    doc.text('Total:', margin + 290, currentY + 5, { width: 80, align: 'right' }); // Better Y position
    doc.text(formatCurrency(invoice.total), margin + 380, currentY + 5, { width: 80, align: 'right' }); // Better Y position

    // Footer - properly positioned to prevent overflow
    const footerY = pageHeight - 60; // Larger footer height for better positioning
    doc.rect(0, footerY, pageWidth, 60).fill('#153059');
    
    try {
      doc.image('./public/images/palm-cafe-logo.png', margin, footerY + 5, { width: 15, height: 15 }); // Larger logo
    } catch (error) {
      // Fallback logo in footer
      doc.circle(margin + 7, footerY + 12, 7).fill('#f4e1ba'); // Larger circle
    }
    
    doc.fontSize(9).font('Helvetica-Bold').fill('#ffffff').text('Thank you for visiting Palm Cafe!', 0, footerY + 20, { align: 'center', width: pageWidth }); // Better positioned and larger font
    // doc.fontSize(5).font('Helvetica').fill('#f4e1ba').text('Generated by Palm Cafe Management System', 0, footerY + 20, { align: 'center', width: pageWidth }); // Smaller font

    doc.end();
  });
};

// Authentication Routes

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Create new user
    const user = await User.create({ username, email, password });
    
    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      message: 'User registered successfully',
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Validate password
    const isValidPassword = await User.validatePassword(user, password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await User.updateLastLogin(user.id);

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      message: 'Login successful',
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Get current user profile
app.get('/api/auth/profile', auth, async (req, res) => {
  try {
    res.json({
      user: { id: req.user.id, username: req.user.username, email: req.user.email, role: req.user.role }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// API Routes

// Get all categories
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await Category.getAll();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get categories with item counts
app.get('/api/categories/with-counts', async (req, res) => {
  try {
    const categories = await Category.getWithItemCounts();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories with counts:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Add new category
app.post('/api/categories', async (req, res) => {
  try {
    const { name, description, sort_order } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const newCategory = {
      id: uuidv4(),
      name: name.trim(),
      description: description ? description.trim() : '',
      sort_order: sort_order || 0
    };

    const createdCategory = await Category.create(newCategory);
    res.status(201).json(createdCategory);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update category
app.put('/api/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, sort_order, is_active } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const updatedCategory = await Category.update(id, {
      name: name.trim(),
      description: description ? description.trim() : '',
      sort_order: sort_order || 0,
      is_active: is_active !== undefined ? is_active : true
    });

    res.json(updatedCategory);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete category
app.delete('/api/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Category.delete(id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Get all menu items
app.get('/api/menu', async (req, res) => {
  try {
    const menuItems = await MenuItem.getAll();
    res.json(menuItems);
  } catch (error) {
    console.error('Error fetching menu items:', error);
    res.status(500).json({ error: 'Failed to fetch menu items' });
  }
});

// Get menu items grouped by category
app.get('/api/menu/grouped', async (req, res) => {
  try {
    const menuItems = await MenuItem.getGroupedByCategory();
    res.json(menuItems);
  } catch (error) {
    console.error('Error fetching menu items grouped:', error);
    res.status(500).json({ error: 'Failed to fetch menu items' });
  }
});

// Add new menu item
app.post('/api/menu', async (req, res) => {
  try {
    const { category_id, name, description, price, sort_order } = req.body;
    
    if (!category_id || !name || !price) {
      return res.status(400).json({ error: 'Category, name and price are required' });
    }

    const newItem = {
      id: uuidv4(),
      category_id,
      name: name.trim(),
      description: description ? description.trim() : '',
      price: parseFloat(price),
      sort_order: sort_order || 0
    };

    const createdItem = await MenuItem.create(newItem);
    res.status(201).json(createdItem);
  } catch (error) {
    console.error('Error creating menu item:', error);
    res.status(500).json({ error: 'Failed to create menu item' });
  }
});

// Update menu item
app.put('/api/menu/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { category_id, name, description, price, sort_order, is_active } = req.body;
    
    if (!category_id || !name || !price) {
      return res.status(400).json({ error: 'Category, name and price are required' });
    }

    const updatedItem = await MenuItem.update(id, {
      category_id,
      name: name.trim(),
      description: description ? description.trim() : '',
      price: parseFloat(price),
      sort_order: sort_order || 0,
      is_active: is_active !== undefined ? is_active : true
    });

    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating menu item:', error);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

// Delete menu item
app.delete('/api/menu/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await MenuItem.delete(id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting menu item:', error);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

// Export menu to Excel
app.get('/api/menu/export', async (req, res) => {
  try {
    const menuItems = await MenuItem.getAll();
    const categories = await Category.getAll();
    
    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    
    // Menu items worksheet
    const menuData = menuItems.map(item => ({
      'Category': item.category_name || 'Uncategorized',
      'Item Name': item.name,
      'Description': item.description || '',
      'Price': item.price,
      'Sort Order': item.sort_order
    }));
    
    const menuWorksheet = XLSX.utils.json_to_sheet(menuData);
    XLSX.utils.book_append_sheet(workbook, menuWorksheet, 'Menu Items');
    
    // Categories worksheet
    const categoryData = categories.map(cat => ({
      'Category Name': cat.name,
      'Description': cat.description || '',
      'Sort Order': cat.sort_order
    }));
    
    const categoryWorksheet = XLSX.utils.json_to_sheet(categoryData);
    XLSX.utils.book_append_sheet(workbook, categoryWorksheet, 'Categories');
    
    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Set headers for download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=palm-cafe-menu.xlsx');
    
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting menu:', error);
    res.status(500).json({ error: 'Failed to export menu' });
  }
});

// Import menu from Excel
app.post('/api/menu/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read Excel file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const menuSheet = workbook.Sheets['Menu Items'];
    
    if (!menuSheet) {
      return res.status(400).json({ error: 'Menu Items sheet not found in Excel file' });
    }

    // Convert to JSON
    const menuData = XLSX.utils.sheet_to_json(menuSheet);
    
    if (menuData.length === 0) {
      return res.status(400).json({ error: 'No data found in Menu Items sheet' });
    }

    // Get existing categories for mapping
    const categories = await Category.getAll();
    const categoryMap = {};
    categories.forEach(cat => {
      categoryMap[cat.name.toLowerCase()] = cat.id;
    });

    // Process menu items
    const itemsToImport = [];
    const errors = [];

    for (let i = 0; i < menuData.length; i++) {
      const row = menuData[i];
      const rowNumber = i + 2; // Excel rows start at 1, but we have header

      try {
        // Validate required fields
        if (!row['Item Name'] || !row['Price']) {
          errors.push(`Row ${rowNumber}: Item Name and Price are required`);
          continue;
        }

        // Find or create category
        let categoryId = null;
        if (row['Category']) {
          const categoryName = row['Category'].toString().trim();
          categoryId = categoryMap[categoryName.toLowerCase()];
          
          if (!categoryId) {
            // Create new category
            const newCategory = {
              id: uuidv4(),
              name: categoryName,
              description: '',
              sort_order: categories.length + 1
            };
            
            const createdCategory = await Category.create(newCategory);
            categoryId = createdCategory.id;
            categoryMap[categoryName.toLowerCase()] = categoryId;
            categories.push(createdCategory);
          }
        }

        // Create menu item
        const menuItem = {
          id: uuidv4(),
          category_id: categoryId,
          name: row['Item Name'].toString().trim(),
          description: row['Description'] ? row['Description'].toString().trim() : '',
          price: parseFloat(row['Price']),
          sort_order: row['Sort Order'] ? parseInt(row['Sort Order']) : 0
        };

        itemsToImport.push(menuItem);
      } catch (error) {
        errors.push(`Row ${rowNumber}: ${error.message}`);
      }
    }

    // Import items
    const importResults = await MenuItem.bulkImport(itemsToImport);
    
    const successCount = importResults.filter(r => r.success).length;
    const failureCount = importResults.filter(r => !r.success).length;

    res.json({
      message: `Import completed. ${successCount} items imported successfully, ${failureCount} failed.`,
      successCount,
      failureCount,
      errors: errors.concat(importResults.filter(r => !r.success).map(r => r.error))
    });

  } catch (error) {
    console.error('Error importing menu:', error);
    res.status(500).json({ error: 'Failed to import menu' });
  }
});

// Get current tax settings
app.get('/api/tax-settings', async (req, res) => {
  try {
    const taxSettings = await TaxSettings.getCurrent();
    res.json(taxSettings);
  } catch (error) {
    console.error('Error fetching tax settings:', error);
    res.status(500).json({ error: 'Failed to fetch tax settings' });
  }
});

// Update tax settings
app.put('/api/tax-settings', async (req, res) => {
  try {
    const { tax_rate, tax_name } = req.body;
    
    if (tax_rate === undefined || !tax_name) {
      return res.status(400).json({ error: 'Tax rate and tax name are required' });
    }

    const updatedSettings = await TaxSettings.update({
      tax_rate: parseFloat(tax_rate),
      tax_name: tax_name.trim()
    });

    res.json(updatedSettings);
  } catch (error) {
    console.error('Error updating tax settings:', error);
    res.status(500).json({ error: 'Failed to update tax settings' });
  }
});

// Get tax history
app.get('/api/tax-settings/history', async (req, res) => {
  try {
    const history = await TaxSettings.getHistory();
    res.json(history);
  } catch (error) {
    console.error('Error fetching tax history:', error);
    res.status(500).json({ error: 'Failed to fetch tax history' });
  }
});

// Calculate tax for a given subtotal
app.post('/api/calculate-tax', async (req, res) => {
  try {
    const { subtotal } = req.body;
    
    if (subtotal === undefined) {
      return res.status(400).json({ error: 'Subtotal is required' });
    }

    const taxCalculation = await TaxSettings.calculateTax(parseFloat(subtotal));
    res.json(taxCalculation);
  } catch (error) {
    console.error('Error calculating tax:', error);
    res.status(500).json({ error: 'Failed to calculate tax' });
  }
});

// Get current currency settings
app.get('/api/currency-settings', async (req, res) => {
  try {
    const currencySettings = await CurrencySettings.getCurrent();
    res.json(currencySettings);
  } catch (error) {
    console.error('Error fetching currency settings:', error);
    res.status(500).json({ error: 'Failed to fetch currency settings' });
  }
});

// Update currency settings
app.put('/api/currency-settings', async (req, res) => {
  try {
    const { currency_code, currency_symbol, currency_name } = req.body;
    
    if (!currency_code || !currency_symbol || !currency_name) {
      return res.status(400).json({ error: 'Currency code, symbol, and name are required' });
    }

    const updatedSettings = await CurrencySettings.update({
      currency_code: currency_code.trim(),
      currency_symbol: currency_symbol.trim(),
      currency_name: currency_name.trim()
    });

    res.json(updatedSettings);
  } catch (error) {
    console.error('Error updating currency settings:', error);
    res.status(500).json({ error: 'Failed to update currency settings' });
  }
});

// Get currency history
app.get('/api/currency-settings/history', async (req, res) => {
  try {
    const history = await CurrencySettings.getHistory();
    res.json(history);
  } catch (error) {
    console.error('Error fetching currency history:', error);
    res.status(500).json({ error: 'Failed to fetch currency history' });
  }
});

// Get available currencies
app.get('/api/currency-settings/available', async (req, res) => {
  try {
    const currencies = await CurrencySettings.getAvailableCurrencies();
    res.json(currencies);
  } catch (error) {
    console.error('Error fetching available currencies:', error);
    res.status(500).json({ error: 'Failed to fetch available currencies' });
  }
});

// Get all invoices
app.get('/api/invoices', async (req, res) => {
  try {
    const invoices = await Invoice.getAll();
    res.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// Create new invoice
app.post('/api/invoices', async (req, res) => {
  try {
    const { customerName, customerPhone, items, tipAmount, date } = req.body;
    
    if (!customerName || !items || items.length === 0) {
      return res.status(400).json({ error: 'Customer name and items are required' });
    }

    const invoiceNumber = await Invoice.getNextInvoiceNumber();

    // Calculate subtotal
    const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0);
    
    // Calculate tax
    const taxCalculation = await TaxSettings.calculateTax(subtotal);
    
    // Calculate total
    const tipAmountNum = parseFloat(tipAmount) || 0;
    const total = subtotal + taxCalculation.taxAmount + tipAmountNum;

    const invoiceData = {
      invoiceNumber,
      customerName,
      customerPhone,
      items,
      subtotal,
      taxAmount: taxCalculation.taxAmount,
      tipAmount: tipAmountNum,
      total,
      date
    };

    const createdInvoice = await Invoice.create(invoiceData);

    try {
      const pdfBase64 = await generatePDF(createdInvoice);
      res.json({
        invoiceNumber,
        pdf: pdfBase64,
        taxInfo: {
          taxRate: taxCalculation.taxRate,
          taxName: taxCalculation.taxName,
          taxAmount: taxCalculation.taxAmount
        }
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      res.status(500).json({ error: 'Failed to generate PDF' });
    }
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// Download invoice
app.get('/api/invoices/:invoiceNumber/download', async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    
    const invoice = await Invoice.getByNumber(invoiceNumber);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    try {
      const pdfBase64 = await generatePDF(invoice);
      res.json({ pdf: pdfBase64 });
    } catch (error) {
      console.error('Error generating PDF:', error);
      res.status(500).json({ error: 'Failed to generate PDF' });
    }
  } catch (error) {
    console.error('Error downloading invoice:', error);
    res.status(500).json({ error: 'Failed to download invoice' });
  }
});

// Get invoice statistics
app.get('/api/statistics', async (req, res) => {
  try {
    const statistics = await Invoice.getStatistics();
    res.json(statistics);
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const dbConnected = await testConnection();
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: dbConnected ? 'connected' : 'disconnected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      timestamp: new Date().toISOString(),
      error: error.message 
    });
  }
});

// Initialize database and start server
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('Failed to connect to database. Please check your database configuration.');
      process.exit(1);
    }

    // Initialize database tables
    await initializeDatabase();

    // Start server
    app.listen(PORT, HOST, () => {
      console.log(`Palm Cafe server running on ${HOST}:${PORT}`);
      console.log(`API available at http://${HOST}:${PORT}/api`);
      console.log(`Local access: http://localhost:${PORT}/api`);
      console.log('Database connected and initialized successfully');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer(); 