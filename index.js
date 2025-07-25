const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const { initializeDatabase, testConnection, pool } = require('./config/database');
const MenuItem = require('./models/menuItem');
const Category = require('./models/category');
const Invoice = require('./models/invoice');
const TaxSettings = require('./models/taxSettings');
const CurrencySettings = require('./models/currencySettings');
const User = require('./models/user');
const Inventory = require('./models/inventory');
const Order = require('./models/order');
const Customer = require('./models/customer');
const { auth, adminAuth, chefAuth, JWT_SECRET } = require('./middleware/auth');
const logger = require('./config/logger');
const { generalLimiter, authLimiter, uploadLimiter, apiLimiter } = require('./middleware/rateLimiter');
const PaymentMethod = require('./models/paymentMethod');

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
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      // Development origins
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://palm-cafe-api-r6rx.vercel.app',
      'https://palm-cafe-ui.vercel.app',
      'https://*.vercel.app'
    ];
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    
    // Allow any Vercel subdomain
    if (origin.includes('.vercel.app')) {
      return callback(null, true);
    }
    
    // Allow any HTTPS origin for development flexibility
    if (origin.startsWith('https://')) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// Handle preflight requests
app.options('*', cors());

// Apply general rate limiting
// app.use(generalLimiter);

// HTTP request logging
app.use(morgan('combined', { stream: logger.stream }));

// Log CORS-related requests for debugging
app.use((req, res, next) => {
  const origin = req.headers.origin || 'No origin';
  const userAgent = req.headers['user-agent'] || 'No user agent';
  logger.info(`${req.method} ${req.path} - Origin: ${origin} - User-Agent: ${userAgent.substring(0, 50)}...`);
  
  // Log CORS preflight requests specifically
  if (req.method === 'OPTIONS') {
    logger.info(`CORS Preflight Request - Origin: ${origin}`);
  }
  
  next();
});

app.use(express.json());

// Generate PDF invoice
const generatePDF = async (invoice) => {
  // Get current currency settings with better error handling
  let currencySymbol = '₹'; // Default to INR symbol
  try {
    const currencySettings = await CurrencySettings.getCurrent();
    
    if (currencySettings && currencySettings.currency_symbol) {
      const symbol = String(currencySettings.currency_symbol).trim();
      if (symbol && symbol.length > 0) {
        currencySymbol = symbol;
      }
    }
    
    } catch (error) {
    console.error('Error fetching currency settings for PDF:', error);
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
    
    if (invoice.order_number) {
      doc.fontSize(9).font('Helvetica-Bold').fill('#153059').text('Order #:', margin, currentY + 15);
      doc.fontSize(9).font('Helvetica').text(invoice.order_number, margin + 70, currentY + 15);
      doc.fontSize(9).font('Helvetica').text(`Date: ${new Date(invoice.date).toLocaleDateString()}`, margin, currentY + 25);
      doc.fontSize(9).font('Helvetica').text(`Time: ${new Date(invoice.date).toLocaleTimeString()}`, margin, currentY + 35);
    } else {
      doc.fontSize(9).font('Helvetica').text(`Date: ${new Date(invoice.date).toLocaleDateString()}`, margin, currentY + 15);
      doc.fontSize(9).font('Helvetica').text(`Time: ${new Date(invoice.date).toLocaleTimeString()}`, margin, currentY + 25);
    }
    
    // Right column - Customer details
    const customerY = invoice.order_number ? currentY + 10 : currentY;
    doc.fontSize(11).font('Helvetica-Bold').fill('#153059').text('Customer:', margin + 300, customerY);
    doc.fontSize(11).font('Helvetica').text(invoice.customerName || invoice.customer_name || 'Walk-in Customer', margin + 370, customerY);
    
    if (invoice.customerPhone || invoice.customer_phone) {
      doc.fontSize(9).font('Helvetica').text(`Phone: ${invoice.customerPhone || invoice.customer_phone}`, margin + 300, customerY + 15);
    }

    // Items table
    currentY += invoice.order_number ? 50 : 40; // Extra spacing when order number is present
    
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

    // Payment Method
    currentY += 25; // Add space after total
    if (currentY > pageHeight - 120) {
      doc.addPage();
      currentY = margin + 50;
    }
    
    doc.fontSize(10).font('Helvetica-Bold').fill('#153059').text('Payment Method:', margin, currentY);
    const paymentMethod = invoice.payment_method || 'cash';
    const paymentLabels = {
      'cash': 'Cash',
      'card': 'Card',
      'upi': 'UPI',
      'online': 'Online'
    };
    doc.fontSize(10).font('Helvetica').fill('#153059').text(paymentLabels[paymentMethod] || 'Cash', margin + 120, currentY);

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
app.post('/api/auth/register', authLimiter, async (req, res) => {
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
    
    // Generate JWT token with timezone-friendly settings
    const token = jwt.sign(
      { 
        userId: user.id,
        iat: Math.floor(Date.now() / 1000) // Explicit issue time
      }, 
      JWT_SECRET, 
      { 
        expiresIn: '24h',
        algorithm: 'HS256'
      }
    );

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

// Register new admin (requires existing admin authentication)
app.post('/api/auth/register-admin', auth, async (req, res) => {
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

    // Create new admin user
    const user = await User.create({ username, email, password, role: 'admin' });

    res.status(201).json({
      message: 'Admin registered successfully',
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Admin registration error:', error);
    res.status(500).json({ error: 'Failed to register admin' });
  }
});

// Register new chef (requires existing admin authentication)
app.post('/api/auth/register-chef', chefAuth, async (req, res) => {
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

    // Create new chef user
    const user = await User.create({ username, email, password, role: 'chef' });

    res.status(201).json({
      message: 'Chef registered successfully',
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Chef registration error:', error);
    res.status(500).json({ error: 'Failed to register chef' });
  }
});

// Login user
app.post('/api/auth/login', authLimiter, async (req, res) => {
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

    // Generate JWT token with timezone-friendly settings
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      { 
        userId: user.id,
        iat: now, // Explicit issue time
        exp: now + (24 * 60 * 60) // 24 hours from now
      }, 
      JWT_SECRET, 
      { 
        algorithm: 'HS256'
      }
    );

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

// Server time and timezone info (for debugging)
app.get('/api/server/time', async (req, res) => {
  try {
    const now = new Date();
    res.json({
      serverTime: now.toISOString(),
      serverTimeLocal: now.toString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: Math.floor(now.getTime() / 1000),
      cors: 'working'
    });
  } catch (error) {
    console.error('Time info error:', error);
    res.status(500).json({ error: 'Failed to get server time' });
  }
});

// CORS test endpoint
app.get('/api/cors-test', (req, res) => {
  res.json({ 
    message: 'CORS is working!',
    origin: req.headers.origin,
    method: req.method,
    timestamp: new Date().toISOString(),
    allowedOrigins: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3001',
      'https://palm-cafe-api-r6rx.vercel.app',
      'https://palm-cafe-ui.vercel.app',
      'https://palm-cafe.vercel.app',
      'Any .vercel.app subdomain',
      'Any HTTPS origin'
    ]
  });
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

// Generate categories from menu items
app.post('/api/categories/generate', async (req, res) => {
  try {
    const categories = await Category.generateFromMenuItems();
    res.json({
      message: 'Categories generated successfully from menu items',
      categories: categories
    });
  } catch (error) {
    console.error('Error generating categories from menu items:', error);
    res.status(500).json({ error: 'Failed to generate categories' });
  }
});

// Get auto-generated categories
app.get('/api/categories/auto-generated', async (req, res) => {
  try {
    const categories = await Category.getAutoGenerated();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching auto-generated categories:', error);
    res.status(500).json({ error: 'Failed to fetch auto-generated categories' });
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
      is_available: is_active !== undefined ? is_active : true
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

// Get current tax settings (admin)
app.get('/api/tax-settings', auth, async (req, res) => {
  try {
    const taxSettings = await TaxSettings.getCurrent();
    res.json(taxSettings);
  } catch (error) {
    console.error('Error fetching tax settings:', error);
    res.status(500).json({ error: 'Failed to fetch tax settings' });
  }
});

// Get tax settings for customer menu (public)
app.get('/api/tax-settings/menu', async (req, res) => {
  try {
    const taxSettings = await TaxSettings.getCurrent();
    // Only return show_tax_in_menu flag for customer menu
    res.json({
      show_tax_in_menu: taxSettings.show_tax_in_menu
    });
  } catch (error) {
    console.error('Error fetching tax settings for menu:', error);
    res.status(500).json({ error: 'Failed to fetch tax settings' });
  }
});

// Update tax settings
app.put('/api/tax-settings', auth, adminAuth, async (req, res) => {
  try {
    const { tax_rate, tax_name, show_tax_in_menu, include_tax } = req.body;
    
    if (tax_rate === undefined || !tax_name) {
      return res.status(400).json({ error: 'Tax rate and tax name are required' });
    }

    const updatedSettings = await TaxSettings.update({
      tax_rate: parseFloat(tax_rate),
      tax_name: tax_name.trim(),
      show_tax_in_menu: show_tax_in_menu !== undefined ? show_tax_in_menu : true,
      include_tax: include_tax !== undefined ? include_tax : true
    });

    res.json(updatedSettings);
  } catch (error) {
    console.error('Error updating tax settings:', error);
    res.status(500).json({ error: 'Failed to update tax settings' });
  }
});

// Get tax history
app.get('/api/tax-settings/history', auth, adminAuth, async (req, res) => {
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
    const { customerName, customerPhone, customerEmail, paymentMethod, items, tipAmount, pointsRedeemed, date } = req.body;
    
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
    const pointsRedeemedNum = parseInt(pointsRedeemed) || 0;
    const pointsDiscount = pointsRedeemedNum * 0.1; // 1 point = 0.1 INR
    const total = subtotal + taxCalculation.taxAmount + tipAmountNum - pointsDiscount;

    // Check if customer exists or create new one
    let customer = null;
    if (customerPhone || customerName) {
      customer = await Customer.findByEmailOrPhone(customerName, customerPhone);
      
      if (!customer && customerPhone) {
        // Create new customer if phone number provided
        customer = await Customer.create({
          name: customerName,
          phone: customerPhone,
          email: customerEmail || null,
          address: null,
          date_of_birth: null,
          notes: 'Auto-created from order'
        });
      }
    }

    // First create an order
    const orderData = {
      customer_name: customerName,
      customer_email: customerEmail || null,
      customer_phone: customerPhone,
      items: items.map(item => ({
        menu_item_id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: parseFloat(item.price),
        total: parseFloat(item.price) * item.quantity
      })),
      total_amount: subtotal,
      tax_amount: taxCalculation.taxAmount,
      tip_amount: tipAmountNum,
      points_redeemed: pointsRedeemedNum,
      final_amount: total,
      payment_method: paymentMethod || 'cash',
      notes: ''
    };

    const createdOrder = await Order.create(orderData);

    // Update order with customer_id if customer exists
    if (customer) {
      await pool.execute('UPDATE orders SET customer_id = ? WHERE id = ?', [customer.id, createdOrder.id]);
      
      // Only deduct redeemed points immediately (points earned will be added when order is completed)
      if (pointsRedeemedNum > 0) {
        await Customer.updateLoyaltyData(customer.id, 0, -pointsRedeemedNum);
      }
    }

    const invoiceData = {
      invoiceNumber,
      order_id: createdOrder.id,
      customerName,
      customerPhone,
      paymentMethod: paymentMethod || 'cash',
      items,
      subtotal,
      taxAmount: taxCalculation.taxAmount,
      tipAmount: tipAmountNum,
      total,
      date
    };

    const createdInvoice = await Invoice.create(invoiceData);

    res.json({
      invoiceNumber,
      orderNumber: createdOrder.order_number,
      taxInfo: {
        taxRate: taxCalculation.taxRate,
        taxName: taxCalculation.taxName,
        taxAmount: taxCalculation.taxAmount
      }
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// Generate PDF for invoice
app.get('/api/invoices/:invoiceNumber/pdf', async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    
    const invoice = await Invoice.getByNumber(invoiceNumber);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    try {
      const pdfBase64 = await generatePDF(invoice);
      res.json({ 
        success: true,
        pdf: pdfBase64,
        invoiceNumber: invoice.invoice_number
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      res.status(500).json({ error: 'Failed to generate PDF' });
    }
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Download invoice (legacy endpoint)
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

// Get daily reports data
app.get('/api/reports/daily', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const [rows] = await pool.execute(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as orders,
        SUM(final_amount) as earnings
      FROM orders 
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [days]);

    // Calculate totals
    const totalEarnings = rows.reduce((sum, row) => sum + parseFloat(row.earnings || 0), 0);
    const totalOrders = rows.reduce((sum, row) => sum + parseInt(row.orders || 0), 0);

    res.json({
      dailyData: rows,
      totalEarnings,
      totalOrders
    });
  } catch (error) {
    console.error('Error fetching daily reports:', error);
    res.status(500).json({ error: 'Failed to fetch daily reports' });
  }
});

// Get top ordered items
app.get('/api/reports/top-items', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        mi.id,
        mi.name,
        COALESCE(c.name, 'Uncategorized') as category,
        COUNT(oi.id) as total_orders,
        SUM(oi.total_price) as total_revenue
      FROM menu_items mi
      LEFT JOIN categories c ON mi.category_id = c.id
      LEFT JOIN order_items oi ON mi.id = oi.menu_item_id
      LEFT JOIN orders o ON oi.order_id = o.id
      WHERE (o.status != 'cancelled' OR o.status IS NULL)
      GROUP BY mi.id, mi.name, c.name
      HAVING total_orders > 0
      ORDER BY total_orders DESC, total_revenue DESC
      LIMIT 10
    `);

    res.json({
      topItems: rows
    });
  } catch (error) {
    console.error('Error fetching top items:', error);
    res.status(500).json({ error: 'Failed to fetch top items' });
  }
});

// Inventory Management Routes

// Get all inventory items
app.get('/api/inventory', auth, async (req, res) => {
  try {
    const inventory = await Inventory.getAll();
    res.json(inventory);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// Create new inventory item
app.post('/api/inventory', auth, async (req, res) => {
  try {
    const { name, category, quantity, unit, cost_per_unit, supplier, reorder_level, description } = req.body;
    
    if (!name || !category || !quantity || !unit) {
      return res.status(400).json({ error: 'Name, category, quantity, and unit are required' });
    }

    const newItem = await Inventory.create({
      name,
      category,
      quantity: parseFloat(quantity),
      unit,
      cost_per_unit: cost_per_unit ? parseFloat(cost_per_unit) : null,
      supplier,
      reorder_level: reorder_level ? parseFloat(reorder_level) : null,
      description
    });

    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error creating inventory item:', error);
    res.status(500).json({ error: 'Failed to create inventory item' });
  }
});

// Update inventory item
app.put('/api/inventory/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, quantity, unit, cost_per_unit, supplier, reorder_level, description } = req.body;
    
    if (!name || !category || !quantity || !unit) {
      return res.status(400).json({ error: 'Name, category, quantity, and unit are required' });
    }

    const updatedItem = await Inventory.update(id, {
      name,
      category,
      quantity: parseFloat(quantity),
      unit,
      cost_per_unit: cost_per_unit ? parseFloat(cost_per_unit) : null,
      supplier,
      reorder_level: reorder_level ? parseFloat(reorder_level) : null,
      description
    });

    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating inventory item:', error);
    res.status(500).json({ error: 'Failed to update inventory item' });
  }
});

// Delete inventory item
app.delete('/api/inventory/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    await Inventory.delete(id);
    res.json({ message: 'Inventory item deleted successfully' });
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    res.status(500).json({ error: 'Failed to delete inventory item' });
  }
});

// Get inventory categories
app.get('/api/inventory/categories', auth, async (req, res) => {
  try {
    const categories = await Inventory.getCategories();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching inventory categories:', error);
    res.status(500).json({ error: 'Failed to fetch inventory categories' });
  }
});

// Update stock quantity
app.patch('/api/inventory/:id/stock', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    
    if (quantity === undefined || quantity < 0) {
      return res.status(400).json({ error: 'Valid quantity is required' });
    }

    await Inventory.updateStock(id, parseFloat(quantity));
    res.json({ message: 'Stock updated successfully' });
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({ error: 'Failed to update stock' });
  }
});

// Get low stock items
app.get('/api/inventory/low-stock', auth, async (req, res) => {
  try {
    const lowStockItems = await Inventory.getLowStockItems();
    res.json(lowStockItems);
  } catch (error) {
    console.error('Error fetching low stock items:', error);
    res.status(500).json({ error: 'Failed to fetch low stock items' });
  }
});

// Get out of stock items
app.get('/api/inventory/out-of-stock', auth, async (req, res) => {
  try {
    const outOfStockItems = await Inventory.getOutOfStockItems();
    res.json(outOfStockItems);
  } catch (error) {
    console.error('Error fetching out of stock items:', error);
    res.status(500).json({ error: 'Failed to fetch out of stock items' });
  }
});

// Get inventory statistics
app.get('/api/inventory/statistics', auth, async (req, res) => {
  try {
    const statistics = await Inventory.getStatistics();
    res.json(statistics);
  } catch (error) {
    console.error('Error fetching inventory statistics:', error);
    res.status(500).json({ error: 'Failed to fetch inventory statistics' });
  }
});

// Export inventory to Excel
app.get('/api/inventory/export', auth, async (req, res) => {
  try {
    const { buffer, filename } = await Inventory.exportToExcel();
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting inventory:', error);
    res.status(500).json({ error: 'Failed to export inventory' });
  }
});

// Get inventory import template
app.get('/api/inventory/template', auth, async (req, res) => {
  try {
    const { buffer, filename } = await Inventory.getImportTemplate();
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error generating template:', error);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

// Import inventory from Excel
app.post('/api/inventory/import', auth, uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const results = await Inventory.importFromExcel(req.file.buffer);
    
    res.json({
      message: 'Import completed',
      results: {
        total: results.total,
        successful: results.successful,
        failed: results.failed,
        errors: results.errors
      }
    });
  } catch (error) {
    console.error('Error importing inventory:', error);
    res.status(500).json({ error: 'Failed to import inventory' });
  }
});





// Get inventory item by ID (must come after specific routes)
app.get('/api/inventory/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const item = await Inventory.getById(id);
    
    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    res.json(item);
  } catch (error) {
    console.error('Error fetching inventory item:', error);
    res.status(500).json({ error: 'Failed to fetch inventory item' });
  }
});

// Generate thermal printer content
const generateThermalPrintContent = (order) => {
  const formatCurrency = (amount) => {
    return `₹${parseFloat(amount || 0).toFixed(2)}`;
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  let content = '';
  
  // Header
  content += '='.repeat(32) + '\n';
  content += '        PALM CAFE\n';
  content += '='.repeat(32) + '\n';
  content += `Order #: ${order.order_number}\n`;
  content += `Date: ${formatDate(order.created_at)}\n`;
  content += `Time: ${formatTime(order.created_at)}\n`;
  content += '-'.repeat(32) + '\n';
  
  // Customer Info
  content += `Customer: ${order.customer_name || 'Walk-in Customer'}\n`;
  if (order.customer_phone && order.customer_phone.trim() !== '') {
    content += `Phone: ${order.customer_phone}\n`;
  }
  if (order.payment_method) {
    content += `Payment: ${order.payment_method.toUpperCase()}\n`;
  }
  content += '-'.repeat(32) + '\n';
  
  // Items
  content += 'ITEMS:\n';
  order.items.forEach(item => {
    content += `${item.quantity}x ${item.name}\n`;
    content += `    ${formatCurrency(item.price)} each\n`;
    content += `    ${formatCurrency(item.total)}\n`;
  });
  content += '-'.repeat(32) + '\n';
  
  // Totals
  content += `Subtotal: ${formatCurrency(order.total_amount)}\n`;
  if (order.tax_amount > 0) {
    content += `Tax: ${formatCurrency(order.tax_amount)}\n`;
  }
  if (order.tip_amount > 0) {
    content += `Tip: ${formatCurrency(order.tip_amount)}\n`;
  }
  content += `TOTAL: ${formatCurrency(order.final_amount)}\n`;
  content += '-'.repeat(32) + '\n';
  
  // Notes
  if (order.notes) {
    content += `NOTES: ${order.notes}\n`;
    content += '-'.repeat(32) + '\n';
  }
  
  // Footer
  content += 'Thank you for your order!\n';
  content += 'Please wait for your number\n';
  content += '='.repeat(32) + '\n';
  content += '\n\n\n\n\n'; // Extra spacing for thermal printer
  
  return content;
};

// Order endpoints
// Get all orders (admin only)
app.get('/api/orders', auth, async (req, res) => {
  try {
    const { customer_phone, order_number } = req.query;
    
    let orders;
    if (customer_phone) {
      // Filter orders by customer phone
      orders = await Order.getByCustomerPhone(customer_phone);
    } else if (order_number) {
      // Filter orders by order number
      orders = await Order.getByOrderNumber(order_number);
    } else {
      // Get all orders
      orders = await Order.getAll();
    }
    
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get customer orders (public endpoint)
app.get('/api/customer/orders', async (req, res) => {
  try {
    const { customer_phone } = req.query;
    
    if (!customer_phone) {
      return res.status(400).json({ error: 'Customer phone number is required' });
    }
    
    const orders = await Order.getByCustomerPhone(customer_phone);
    res.json(orders);
  } catch (error) {
    console.error('Error fetching customer orders:', error);
    res.status(500).json({ error: 'Failed to fetch customer orders' });
  }
});

// Update order status
app.patch('/api/orders/:id/status', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const validStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Get the current order to check if points were already awarded
    const currentOrder = await Order.getById(id);
    if (!currentOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const updatedOrder = await Order.updateStatus(id, status);
    
    // Award loyalty points when order is completed (only if not already awarded)
    let loyaltyUpdate = null;
    if (status === 'completed' && currentOrder.status !== 'completed' && updatedOrder.customer_id && !currentOrder.points_awarded) {
      try {
        // Calculate points earned (1 point per 10 INR spent)
        const pointsEarned = Math.floor(updatedOrder.final_amount / 10);
        
        // Update customer loyalty data
        const updatedCustomer = await Customer.updateLoyaltyData(updatedOrder.customer_id, updatedOrder.final_amount, pointsEarned);
        
        // Mark points as awarded in the order
        await Order.markPointsAwarded(id);
        
        loyaltyUpdate = {
          pointsEarned,
          newTotalPoints: updatedCustomer.loyalty_points,
          message: `Awarded ${pointsEarned} loyalty points for completed order`
        };
        
        console.log(`✅ Loyalty points awarded: ${pointsEarned} points to customer ${updatedOrder.customer_id}`);
      } catch (loyaltyError) {
        console.error('❌ Error awarding loyalty points:', loyaltyError);
        loyaltyUpdate = {
          error: 'Failed to award loyalty points',
          details: loyaltyError.message
        };
      }
    }
    
    res.json({
      ...updatedOrder,
      loyaltyUpdate
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Create new order
app.post('/api/orders', auth, async (req, res) => {
  try {
    const orderData = req.body;
    
    if (!orderData.items || orderData.items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    const newOrder = await Order.create(orderData);
    res.status(201).json(newOrder);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Create test order (for debugging)
app.post('/api/orders/test', auth, async (req, res) => {
  try {
    console.log('🔍 Creating test order...');
    
    // First, let's get available menu items
    const menuItems = await MenuItem.getAll();
    console.log('📋 Available menu items:', menuItems.length);
    
    if (menuItems.length === 0) {
      return res.status(400).json({ error: 'No menu items available. Please add menu items first.' });
    }
    
    // Use the first available menu item
    const firstItem = menuItems[0];
    const secondItem = menuItems[1] || firstItem; // Use first item twice if only one exists
    
    console.log('🍽️ Using menu items:', { first: firstItem.name, second: secondItem.name });
    
    const testOrder = {
      customer_name: 'Test Customer',
      customer_email: 'test@example.com',
      customer_phone: '+91 98765 43210',
      items: [
        {
          menu_item_id: firstItem.id,
          name: firstItem.name,
          quantity: 2,
          price: firstItem.price,
          total: firstItem.price * 2
        },
        {
          menu_item_id: secondItem.id,
          name: secondItem.name,
          quantity: 1,
          price: secondItem.price,
          total: secondItem.price
        }
      ],
      total_amount: (firstItem.price * 2) + secondItem.price,
      tax_amount: ((firstItem.price * 2) + secondItem.price) * 0.085, // 8.5% tax
      tip_amount: 20.00,
      final_amount: ((firstItem.price * 2) + secondItem.price) * 1.085 + 20.00,
      payment_method: 'cash',
      notes: 'Test order for kitchen display'
    };

    console.log('📝 Test order data:', testOrder);
    
    const newOrder = await Order.create(testOrder);
    console.log('✅ Test order created successfully:', newOrder.id);
    res.status(201).json(newOrder);
  } catch (error) {
    console.error('❌ Error creating test order:', error);
    res.status(500).json({ error: 'Failed to create test order', details: error.message });
  }
});

// Print order for thermal printer
app.post('/api/orders/:id/print', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.getById(id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Generate thermal printer formatted text
    const printContent = generateThermalPrintContent(order);
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="order-${order.order_number}.txt"`);
    res.send(printContent);
  } catch (error) {
    console.error('Error printing order:', error);
    res.status(500).json({ error: 'Failed to print order' });
  }
});

// Customer Management Routes

// Get all customers
app.get('/api/customers', auth, async (req, res) => {
  try {
    const customers = await Customer.getAll();
    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Get customer by ID
app.get('/api/customers/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await Customer.getById(id);
    
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    res.json(customer);
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// Public customer authentication endpoints (no auth required)
// Search customers by phone for login
app.get('/api/customer/login/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const customer = await Customer.findByEmailOrPhone(null, phone);
    
    if (customer) {
      res.json(customer);
    } else {
      res.status(404).json({ error: 'Customer not found' });
    }
  } catch (error) {
    console.error('Error finding customer for login:', error);
    res.status(500).json({ error: 'Failed to find customer' });
  }
});

// Register new customer (public endpoint)
app.post('/api/customer/register', async (req, res) => {
  try {
    const { name, email, phone, address, date_of_birth, notes } = req.body;
    
    if (!name || !phone) {
      return res.status(400).json({ error: 'Customer name and phone number are required' });
    }

    // Check if customer already exists
    const existingCustomer = await Customer.findByEmailOrPhone(email, phone);
    if (existingCustomer) {
      return res.status(400).json({ error: 'Customer with this phone number already exists' });
    }

    const customerData = {
      name: name.trim(),
      email: email ? email.trim() : null,
      phone: phone.trim(),
      address: address ? address.trim() : null,
      date_of_birth: date_of_birth || null,
      notes: notes ? notes.trim() : null
    };

    const customer = await Customer.create(customerData);
    res.status(201).json(customer);
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Search customers (admin only)
app.get('/api/customers/search/:query', auth, async (req, res) => {
  try {
    const { query } = req.params;
    const customers = await Customer.search(query);
    res.json(customers);
  } catch (error) {
    console.error('Error searching customers:', error);
    res.status(500).json({ error: 'Failed to search customers' });
  }
});

// Create new customer (admin only)
app.post('/api/customers', auth, async (req, res) => {
  try {
    const { name, email, phone, address, date_of_birth, notes } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const customerData = {
      name: name.trim(),
      email: email ? email.trim() : null,
      phone: phone ? phone.trim() : null,
      address: address ? address.trim() : null,
      date_of_birth: date_of_birth || null,
      notes: notes ? notes.trim() : null
    };

    const customer = await Customer.create(customerData);
    res.status(201).json(customer);
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Update customer
app.put('/api/customers/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, address, date_of_birth, notes, is_active } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const customerData = {
      name: name.trim(),
      email: email ? email.trim() : null,
      phone: phone ? phone.trim() : null,
      address: address ? address.trim() : null,
      date_of_birth: date_of_birth || null,
      notes: notes ? notes.trim() : null,
      is_active: is_active !== undefined ? is_active : true
    };

    const customer = await Customer.update(id, customerData);
    res.json(customer);
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// Get customer order history
app.get('/api/customers/:id/orders', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const orders = await Customer.getOrderHistory(id);
    res.json(orders);
  } catch (error) {
    console.error('Error fetching customer orders:', error);
    res.status(500).json({ error: 'Failed to fetch customer orders' });
  }
});

// Get customer statistics
app.get('/api/customers/statistics', auth, async (req, res) => {
  try {
    const statistics = await Customer.getStatistics();
    res.json(statistics);
  } catch (error) {
    console.error('Error fetching customer statistics:', error);
    res.status(500).json({ error: 'Failed to fetch customer statistics' });
  }
});

// Redeem loyalty points
app.post('/api/customers/:id/redeem-points', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { points } = req.body;
    
    if (!points || points <= 0) {
      return res.status(400).json({ error: 'Valid points amount is required' });
    }

    const customer = await Customer.redeemPoints(id, points);
    res.json(customer);
  } catch (error) {
    console.error('Error redeeming points:', error);
    res.status(500).json({ error: 'Failed to redeem points' });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const dbConnected = await testConnection();
    const healthStatus = {
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: dbConnected ? 'connected' : 'disconnected',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0'
    };
    
    logger.info('Health check passed', healthStatus);
    res.json(healthStatus);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({ 
      status: 'ERROR', 
      timestamp: new Date().toISOString(),
      error: error.message 
    });
  }
});

// Payment Methods Routes

// Get all payment methods (public)
app.get('/api/payment-methods', async (req, res) => {
  try {
    const paymentMethods = await PaymentMethod.getAll();
    res.json(paymentMethods);
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
});

// Get all payment methods (admin)
app.get('/api/admin/payment-methods', auth, adminAuth, async (req, res) => {
  try {
    const paymentMethods = await PaymentMethod.getAllForAdmin();
    res.json(paymentMethods);
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
});

// Create payment method (admin)
app.post('/api/admin/payment-methods', auth, adminAuth, async (req, res) => {
  try {
    const paymentMethodData = req.body;
    
    if (!paymentMethodData.name || !paymentMethodData.code) {
      return res.status(400).json({ error: 'Name and code are required' });
    }

    const newPaymentMethod = await PaymentMethod.create(paymentMethodData);
    res.status(201).json(newPaymentMethod);
  } catch (error) {
    console.error('Error creating payment method:', error);
    res.status(500).json({ error: 'Failed to create payment method', details: error.message });
  }
});

// Update payment method (admin)
app.put('/api/admin/payment-methods/:id', auth, adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const paymentMethodData = req.body;
    
    if (!paymentMethodData.name || !paymentMethodData.code) {
      return res.status(400).json({ error: 'Name and code are required' });
    }

    const updatedPaymentMethod = await PaymentMethod.update(id, paymentMethodData);
    res.json(updatedPaymentMethod);
  } catch (error) {
    console.error('Error updating payment method:', error);
    res.status(500).json({ error: 'Failed to update payment method', details: error.message });
  }
});

// Delete payment method (admin)
app.delete('/api/admin/payment-methods/:id', auth, adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await PaymentMethod.delete(id);
    res.json(result);
  } catch (error) {
    console.error('Error deleting payment method:', error);
    res.status(500).json({ error: 'Failed to delete payment method', details: error.message });
  }
});

// Toggle payment method status (admin)
app.patch('/api/admin/payment-methods/:id/toggle', auth, adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updatedPaymentMethod = await PaymentMethod.toggleStatus(id);
    res.json(updatedPaymentMethod);
  } catch (error) {
    console.error('Error toggling payment method status:', error);
    res.status(500).json({ error: 'Failed to toggle payment method status', details: error.message });
  }
});

// Reorder payment methods (admin)
app.post('/api/admin/payment-methods/reorder', auth, adminAuth, async (req, res) => {
  try {
    const { orderedIds } = req.body;
    
    if (!orderedIds || !Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'Ordered IDs array is required' });
    }

    const result = await PaymentMethod.reorder(orderedIds);
    res.json(result);
  } catch (error) {
    console.error('Error reordering payment methods:', error);
    res.status(500).json({ error: 'Failed to reorder payment methods', details: error.message });
  }
});

// Backup endpoint (protected)
app.post('/api/backup', auth, adminAuth, async (req, res) => {
  try {
    const DatabaseBackup = require('./scripts/backup');
    const backup = new DatabaseBackup();
    const result = await backup.performBackup();
    
    if (result.success) {
      logger.info('Manual backup completed successfully', result);
      res.json({ 
        success: true, 
        message: 'Backup completed successfully',
        backupPath: result.backupPath,
        stats: result.stats
      });
    } else {
      logger.error('Manual backup failed:', result.error);
      res.status(500).json({ 
        success: false, 
        error: 'Backup failed',
        details: result.error
      });
    }
  } catch (error) {
    logger.error('Backup endpoint error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Backup failed',
      details: error.message
    });
  }
});

// Initialize database and start server
const startServer = async () => {
  try {
    // Set timezone to UTC for consistent time handling
    process.env.TZ = 'UTC';
    logger.info('🌍 Server timezone set to UTC for international compatibility');
    
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database. Please check your database configuration.');
      process.exit(1);
    }

    // Initialize database
    await initializeDatabase();

    // Start server
    app.listen(PORT, HOST, () => {
      logger.info(`Palm Cafe server running on ${HOST}:${PORT}`);
      logger.info(`API available at http://${HOST}:${PORT}/api`);
      logger.info(`Local access: http://localhost:${PORT}/api`);
      logger.info('Database connected and initialized successfully');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer(); 