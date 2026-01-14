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
const http = require('http');
const WebSocketManager = require('./websocket');
const { initializeDatabase, testConnection, pool } = require('./config/database');
const MenuItem = require('./models/menuItem');
const Category = require('./models/category');
const Invoice = require('./models/invoice');
const TaxSettings = require('./models/taxSettings');
const CurrencySettings = require('./models/currencySettings');
const CafeSettings = require('./models/cafeSettings');
const User = require('./models/user');
const Inventory = require('./models/inventory');
const Order = require('./models/order');
const Customer = require('./models/customer');
const Cafe = require('./models/cafe');
const CafeMetrics = require('./models/cafeMetrics');
const CafeDailyMetrics = require('./models/cafeDailyMetrics');
const subscriptionService = require('./services/subscriptionService');
const featureService = require('./services/featureService');
const auditService = require('./services/auditService');
const Feature = require('./models/feature');
const bcrypt = require('bcryptjs');
const { auth, adminAuth, chefAuth, JWT_SECRET } = require('./middleware/auth');
const { validateCafeAccess, requireSuperAdmin } = require('./middleware/cafeAuth');
const { requireFeature, requireActiveSubscription } = require('./middleware/subscriptionAuth');
const { requireOnboarding, allowOnboardingRoutes } = require('./middleware/onboardingAuth');
const logger = require('./config/logger');
const { generalLimiter, authLimiter, uploadLimiter, apiLimiter } = require('./middleware/rateLimiter');
const PaymentMethod = require('./models/paymentMethod');

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0'; // Allow network access

// Configure multer for Excel file uploads
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

// Configure multer for image uploads
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      // Production origins
      'https://app.cafe.nevyaa.com',
      // Development origins (from environment variables)
      process.env.FRONTEND_URL,
      process.env.ADMIN_URL,
      // Fallback for development
      ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000', 'http://localhost:3001'] : [])
    ].filter(Boolean); // Remove null/undefined values
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
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
app.use(generalLimiter);

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

// Serve static files from public directory
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

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

  // Get cafe settings for dynamic content
  let cafeSettings = {
    cafe_name: 'Our Cafe',
    logo_url: '/images/palm-cafe-logo.png'
  };
  try {
    const settings = await CafeSettings.getCurrent();
    if (settings) {
      cafeSettings = settings;
    }
  } catch (error) {
    console.error('Error fetching cafe settings for PDF:', error);
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
      const logoPath = cafeSettings.logo_url.startsWith('/') ? 
        `./public${cafeSettings.logo_url}` : 
        `./public/images/${cafeSettings.logo_url}`;
      doc.image(logoPath, margin, 10, { width: 50, height: 50 }); // Much larger logo on left
    } catch (error) {
      console.error('Error adding logo to PDF:', error);
      // Fallback to drawn logo
      doc.circle(margin + 25, 35, 25).fill('#153059'); // Larger circle on left
      doc.circle(margin + 25, 35, 25).stroke('#f4e1ba').lineWidth(2);
      doc.fontSize(8).font('Helvetica-Bold').fill('#f4e1ba').text('PALM', margin + 25, 30, { align: 'center' });
      doc.fontSize(6).font('Helvetica').text('CAFE', margin + 25, 40, { align: 'center' });
    }

    // Business name - right side
    doc.fontSize(20).font('Helvetica-Bold').fill('#153059').text(cafeSettings.cafe_name.toUpperCase(), margin + 380, 25, { width: 200 }); // Bold font on right side
    
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
      doc.fontSize(9).font('Helvetica').text(`Date: ${new Date(invoice.invoice_date).toLocaleDateString()}`, margin, currentY + 25);
      doc.fontSize(9).font('Helvetica').text(`Time: ${new Date(invoice.invoice_date).toLocaleTimeString()}`, margin, currentY + 35);
    } else {
      doc.fontSize(9).font('Helvetica').text(`Date: ${new Date(invoice.invoice_date).toLocaleDateString()}`, margin, currentY + 15);
      doc.fontSize(9).font('Helvetica').text(`Time: ${new Date(invoice.invoice_date).toLocaleTimeString()}`, margin, currentY + 25);
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
    doc.text(formatCurrency(invoice.total_amount), margin + 380, currentY + 5, { width: 80, align: 'right' }); // Better Y position

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
      const logoPath = cafeSettings.logo_url.startsWith('/') ? 
        `./public${cafeSettings.logo_url}` : 
        `./public/images/${cafeSettings.logo_url}`;
      doc.image(logoPath, margin, footerY + 5, { width: 15, height: 15 }); // Larger logo
    } catch (error) {
      // Fallback logo in footer
      doc.circle(margin + 7, footerY + 12, 7).fill('#f4e1ba'); // Larger circle
    }
    
    doc.fontSize(9).font('Helvetica-Bold').fill('#ffffff').text(`Thank you for visiting ${cafeSettings.cafe_name}!`, 0, footerY + 20, { align: 'center', width: pageWidth }); // Better positioned and larger font
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

// Register new reception (requires existing admin authentication)
app.post('/api/auth/register-reception', chefAuth, async (req, res) => {
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

    // Create new reception user
    const user = await User.create({ username, email, password, role: 'reception' });

    res.status(201).json({
      message: 'Reception registered successfully',
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Reception registration error:', error);
    res.status(500).json({ error: 'Failed to register reception' });
  }
});

// Register new superadmin (requires existing superadmin authentication)
app.post('/api/auth/register-superadmin', auth, async (req, res) => {
  try {
    // Check if the authenticated user is a superadmin
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmins can register new superadmins' });
    }

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

    // Create new superadmin user
    const user = await User.create({ username, email, password, role: 'superadmin' });

    res.status(201).json({
      message: 'Superadmin registered successfully',
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Superadmin registration error:', error);
    res.status(500).json({ error: 'Failed to register superadmin' });
  }
});

// ========================
// Super Admin Routes - Cafe Management
// ========================
// NOTE: Route order is CRITICAL in Express.js - more specific routes MUST come before parameterized routes
// Order: 1) Exact paths, 2) Paths with specific segments, 3) Parameterized routes

// Get all cafes (Super Admin only) - Base route, no params
app.get('/api/superadmin/cafes', auth, requireSuperAdmin, async (req, res) => {
  try {
    const cafes = await Cafe.getAll();
    res.json(cafes);
  } catch (error) {
    console.error('Error fetching cafes:', error);
    res.status(500).json({ error: 'Failed to fetch cafes' });
  }
});

// Create new cafe (Super Admin only) - Base route, no params
app.post('/api/superadmin/cafes', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { slug, name, description, logo_url, address, phone, email, website } = req.body;

    // Validate required fields
    if (!slug || !name) {
      return res.status(400).json({ error: 'Slug and name are required' });
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Slug must contain only lowercase letters, numbers, and hyphens' });
    }

    // Check if slug already exists
    const slugExists = await Cafe.slugExists(slug);
    if (slugExists) {
      return res.status(400).json({ error: 'A cafe with this slug already exists' });
    }

    const cafe = await Cafe.create({
      slug,
      name,
      description,
      logo_url,
      address,
      phone,
      email,
      website
    });

    res.status(201).json({
      message: 'Cafe created successfully',
      cafe
    });
  } catch (error) {
    console.error('Error creating cafe:', error);
    res.status(500).json({ error: error.message || 'Failed to create cafe' });
  }
});

// Get active cafes only (Super Admin only) - Specific path segment
app.get('/api/superadmin/cafes/active', auth, requireSuperAdmin, async (req, res) => {
  try {
    const cafes = await Cafe.getActive();
    res.json(cafes);
  } catch (error) {
    console.error('Error fetching active cafes:', error);
    res.status(500).json({ error: 'Failed to fetch active cafes' });
  }
});

// Get cafe metrics overview (Super Admin only) - Specific path segment
app.get('/api/superadmin/cafes/metrics/overview', auth, requireSuperAdmin, async (req, res) => {
  try {
    const cafesWithMetrics = await CafeMetrics.getAllCafesMetrics();
    res.json(cafesWithMetrics);
  } catch (error) {
    console.error('Error fetching cafes metrics overview:', error);
    res.status(500).json({ error: 'Failed to fetch cafes metrics overview' });
  }
});

// Get cafe users (Super Admin only) - Specific path with param + segment
app.get('/api/superadmin/cafes/:cafeId/users', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { cafeId } = req.params;
    
    // Verify cafe exists
    const cafe = await Cafe.getById(cafeId);
    if (!cafe) {
      return res.status(404).json({ error: 'Cafe not found' });
    }
    
    // Get all users for this cafe
    const users = await User.getAll(parseInt(cafeId));
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching cafe users:', error);
    res.status(500).json({ error: 'Failed to fetch cafe users' });
  }
});

// Create cafe user (Super Admin only) - Specific path with param + segment
app.post('/api/superadmin/cafes/:cafeId/users', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { cafeId } = req.params;
    const { username, email, password, role } = req.body;
    
    // Validate input
    if (!username || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    // Verify role is valid (not superadmin)
    if (role === 'superadmin') {
      return res.status(400).json({ error: 'Cannot create superadmin users via cafe endpoint' });
    }
    
    // Verify cafe exists
    const cafe = await Cafe.getById(cafeId);
    if (!cafe) {
      return res.status(404).json({ error: 'Cafe not found' });
    }
    
    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    // Create new user with cafe assignment
    const user = await User.create({ 
      username, 
      email, 
      password, 
      role,
      cafe_id: parseInt(cafeId)
    });
    
    const userWithCafe = await User.findByIdWithCafe(user.id);
    
    res.status(201).json({
      message: 'User created successfully',
      user: userWithCafe
    });
  } catch (error) {
    console.error('Error creating cafe user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Get cafe by ID metrics (Super Admin only) - Specific path with param + segment
app.get('/api/superadmin/cafes/:id/metrics', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify cafe exists
    const cafe = await Cafe.getById(id);
    if (!cafe) {
      return res.status(404).json({ error: 'Cafe not found' });
    }
    
    const metrics = await CafeMetrics.getCafeMetrics(parseInt(id));
    
    res.json({
      cafe: {
        id: cafe.id,
        slug: cafe.slug,
        name: cafe.name
      },
      metrics: metrics
    });
  } catch (error) {
    console.error('Error fetching cafe metrics:', error);
    res.status(500).json({ error: 'Failed to fetch cafe metrics' });
  }
});

// Get cafe settings (Super Admin only) - Specific path with param + segment
app.get('/api/superadmin/cafes/:id/settings', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify cafe exists
    const cafe = await Cafe.getById(id);
    if (!cafe) {
      return res.status(404).json({ error: 'Cafe not found' });
    }
    
    // Get cafe settings (scoped to cafe_id if column exists)
    try {
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'cafe_settings' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      let settings;
      if (columns.length > 0) {
        const [rows] = await pool.execute(
          'SELECT * FROM cafe_settings WHERE cafe_id = ? AND is_active = TRUE ORDER BY created_at DESC LIMIT 1',
          [id]
        );
        settings = rows[0] || null;
      } else {
        // Fallback to global settings if cafe_id column doesn't exist
        settings = await CafeSettings.getCurrent();
      }
      
      res.json({
        cafe: {
          id: cafe.id,
          slug: cafe.slug,
          name: cafe.name
        },
        settings: settings || {}
      });
    } catch (error) {
      // If cafe_settings table doesn't exist, return empty settings
      res.json({
        cafe: {
          id: cafe.id,
          slug: cafe.slug,
          name: cafe.name
        },
        settings: {}
      });
    }
  } catch (error) {
    console.error('Error fetching cafe settings:', error);
    res.status(500).json({ error: 'Failed to fetch cafe settings' });
  }
});

// Update cafe settings (Super Admin only) - Specific path with param + segment
app.put('/api/superadmin/cafes/:id/settings', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const settingsData = req.body;
    
    // Verify cafe exists
    const cafe = await Cafe.getById(id);
    if (!cafe) {
      return res.status(404).json({ error: 'Cafe not found' });
    }
    
    // Check if cafe_settings table has cafe_id column
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'cafe_settings' 
      AND COLUMN_NAME = 'cafe_id'
    `);
    
    if (columns.length === 0) {
      return res.status(400).json({ error: 'Cafe settings are not yet scoped to cafes. Please run migration first.' });
    }
    
    // Update or create cafe settings
    const [existing] = await pool.execute(
      'SELECT id FROM cafe_settings WHERE cafe_id = ? AND is_active = TRUE',
      [id]
    );
    
    if (existing.length > 0) {
      // Update existing settings
      const updateFields = Object.keys(settingsData)
        .filter(key => key !== 'id' && key !== 'cafe_id' && key !== 'created_at' && key !== 'updated_at')
        .map(key => `${key} = ?`)
        .join(', ');
      
      const updateValues = Object.keys(settingsData)
        .filter(key => key !== 'id' && key !== 'cafe_id' && key !== 'created_at' && key !== 'updated_at')
        .map(key => settingsData[key]);
      
      updateValues.push(id);
      
      await pool.execute(
        `UPDATE cafe_settings SET ${updateFields}, updated_at = CURRENT_TIMESTAMP WHERE cafe_id = ? AND is_active = TRUE`,
        updateValues
      );
    } else {
      // Create new settings
      const fields = ['cafe_id', ...Object.keys(settingsData).filter(key => key !== 'id' && key !== 'created_at' && key !== 'updated_at')];
      const placeholders = fields.map(() => '?').join(', ');
      const values = [id, ...Object.values(settingsData)];
      
      await pool.execute(
        `INSERT INTO cafe_settings (${fields}, is_active, created_at, updated_at) VALUES (${placeholders}, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        values
      );
    }
    
    // Fetch updated settings
    const [updated] = await pool.execute(
      'SELECT * FROM cafe_settings WHERE cafe_id = ? AND is_active = TRUE ORDER BY created_at DESC LIMIT 1',
      [id]
    );
    
    res.json({
      message: 'Cafe settings updated successfully',
      settings: updated[0]
    });
  } catch (error) {
    console.error('Error updating cafe settings:', error);
    res.status(500).json({ error: 'Failed to update cafe settings' });
  }
});

// Get cafe by ID (Super Admin only) - Generic parameterized route - MUST be LAST
app.get('/api/superadmin/cafes/:id', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const cafe = await Cafe.getById(id);
    
    if (!cafe) {
      return res.status(404).json({ error: 'Cafe not found' });
    }
    
    // Also fetch cafe settings to include branding
    try {
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'cafe_settings' 
        AND COLUMN_NAME = 'cafe_id'
      `);
      
      if (columns.length > 0) {
        // Check which color columns exist in the cafe_settings table
        const [colorColumns] = await pool.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'cafe_settings'
          AND COLUMN_NAME IN ('primary_color', 'accent_color', 'logo_url')
        `);
        
        const existingColorColumns = colorColumns.map(col => col.COLUMN_NAME);
        
        if (existingColorColumns.length > 0) {
          // Build dynamic SELECT query based on existing columns
          const selectColumns = existingColorColumns.join(', ');
          
          const [settings] = await pool.execute(
            `SELECT ${selectColumns} FROM cafe_settings WHERE cafe_id = ? AND is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
            [id]
          );
          
          if (settings.length > 0) {
            if (existingColorColumns.includes('primary_color') && settings[0].primary_color) {
              cafe.primary_color = settings[0].primary_color;
            }
            if (existingColorColumns.includes('accent_color') && settings[0].accent_color) {
              cafe.accent_color = settings[0].accent_color;
            }
            if (existingColorColumns.includes('logo_url') && settings[0].logo_url) {
              cafe.logo_url = settings[0].logo_url;
            }
          }
        }
      }
    } catch (settingsError) {
      // Ignore settings errors, just return cafe data
      console.warn('Error fetching cafe branding:', settingsError);
    }
    
    res.json(cafe);
  } catch (error) {
    console.error('Error fetching cafe:', error);
    res.status(500).json({ error: 'Failed to fetch cafe' });
  }
});

// Update cafe (Super Admin only)
app.put('/api/superadmin/cafes/:id', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { slug, name, description, logo_url, address, phone, email, website, is_active, primary_color, accent_color } = req.body;

    // Validate slug format if provided
    if (slug && !/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Slug must contain only lowercase letters, numbers, and hyphens' });
    }

    // Check if slug already exists (excluding current cafe)
    if (slug) {
      const slugExists = await Cafe.slugExists(slug, id);
      if (slugExists) {
        return res.status(400).json({ error: 'A cafe with this slug already exists' });
      }
    }

    const cafe = await Cafe.update(id, {
      slug,
      name,
      description,
      logo_url,
      address,
      phone,
      email,
      website,
      is_active,
      subscription_plan: req.body.subscription_plan,
      subscription_status: req.body.subscription_status,
      enabled_modules: req.body.enabled_modules
    });

    // Update cafe settings with branding colors if provided
    if (primary_color !== undefined || accent_color !== undefined || logo_url !== undefined) {
      try {
        // Check if cafe_settings table has cafe_id column
        const [columns] = await pool.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'cafe_settings' 
          AND COLUMN_NAME = 'cafe_id'
        `);
        
        if (columns.length > 0) {
          // Get current cafe settings
          const [existing] = await pool.execute(
            'SELECT * FROM cafe_settings WHERE cafe_id = ? AND is_active = TRUE ORDER BY created_at DESC LIMIT 1',
            [id]
          );
          
          const brandingUpdates = {};
          if (primary_color !== undefined) brandingUpdates.primary_color = primary_color;
          if (accent_color !== undefined) brandingUpdates.accent_color = accent_color;
          if (logo_url !== undefined) brandingUpdates.logo_url = logo_url;
          
          if (existing.length > 0) {
            // Update existing settings
            const updateFields = Object.keys(brandingUpdates).map(key => `${key} = ?`).join(', ');
            const updateValues = Object.values(brandingUpdates);
            updateValues.push(id);
            
            await pool.execute(
              `UPDATE cafe_settings SET ${updateFields}, updated_at = CURRENT_TIMESTAMP WHERE cafe_id = ? AND is_active = TRUE`,
              updateValues
            );
          } else {
            // Create new settings with branding
            const fields = ['cafe_id', 'cafe_name', ...Object.keys(brandingUpdates)];
            const placeholders = fields.map(() => '?').join(', ');
            const values = [id, cafe.name, ...Object.values(brandingUpdates)];
            
            await pool.execute(
              `INSERT INTO cafe_settings (${fields.join(', ')}, is_active, created_at, updated_at) VALUES (${placeholders}, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
              values
            );
          }
        }
      } catch (settingsError) {
        // Log error but don't fail the cafe update
        console.warn('Error updating cafe branding settings:', settingsError);
      }
    }

    res.json({
      message: 'Cafe updated successfully',
      cafe
    });
  } catch (error) {
    console.error('Error updating cafe:', error);
    res.status(500).json({ error: error.message || 'Failed to update cafe' });
  }
});

// ========================
// Subscription Management (Super Admin only)
// ========================

// Get subscription info for a cafe
app.get('/api/superadmin/cafes/:id/subscription', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const subscription = await subscriptionService.getCafeSubscription(id);
    
    if (!subscription) {
      return res.status(404).json({ error: 'Cafe not found' });
    }
    
    // Get available plans and modules
    const plans = subscriptionService.getAllPlans();
    const modules = subscriptionService.getAllModules();
    const planFeatures = {};
    
    plans.forEach(plan => {
      planFeatures[plan] = subscriptionService.getPlanFeatures(plan);
    });
    
    res.json({
      subscription,
      available_plans: plans,
      available_modules: modules,
      plan_features: planFeatures
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// Update cafe subscription
app.put('/api/superadmin/cafes/:id/subscription', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { plan, status } = req.body;
    
    // Validate input
    if (plan === undefined && status === undefined) {
      return res.status(400).json({ error: 'Either plan or status must be provided' });
    }
    
    const updatedCafe = await subscriptionService.updateCafeSubscription(id, {
      plan,
      status
    }, req.user.id);
    
    // Verify the update by fetching fresh data
    const freshCafe = await Cafe.getById(id);
    const freshSubscription = await subscriptionService.getCafeSubscription(id);
    
    res.json({
      message: 'Subscription updated successfully',
      cafe: freshCafe || updatedCafe,
      subscription: freshSubscription
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({ error: error.message || 'Failed to update subscription' });
  }
});

// Get feature resolution details for a cafe (Super Admin)
app.get('/api/superadmin/cafes/:id/features', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const details = await featureService.getFeatureResolutionDetails(id);
    
    res.json(details);
  } catch (error) {
    console.error('Error fetching feature details:', error);
    res.status(500).json({ error: 'Failed to fetch feature details' });
  }
});

// Toggle a feature for a cafe (Super Admin override)
app.post('/api/superadmin/cafes/:id/features/:featureKey/toggle', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id, featureKey } = req.params;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }
    
    // Get previous state for audit
    const previousEnabled = await featureService.cafeHasFeature(id, featureKey);
    
    // Toggle feature
    const features = await featureService.toggleCafeFeature(id, featureKey, enabled);
    
    // Log audit event
    await auditService.logAuditEvent(
      id,
      enabled ? auditService.ACTION_TYPES.FEATURE_ENABLED : auditService.ACTION_TYPES.FEATURE_DISABLED,
      previousEnabled ? 'enabled' : 'disabled',
      enabled ? 'enabled' : 'disabled',
      req.user.id
    );
    
    res.json({
      message: `Feature ${featureKey} ${enabled ? 'enabled' : 'disabled'} successfully`,
      features
    });
  } catch (error) {
    console.error('Error toggling feature:', error);
    res.status(500).json({ error: error.message || 'Failed to toggle feature' });
  }
});

// Remove feature override (revert to plan default)
app.delete('/api/superadmin/cafes/:id/features/:featureKey', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id, featureKey } = req.params;
    
    // Get previous state for audit
    const previousEnabled = await featureService.cafeHasFeature(id, featureKey);
    
    // Remove override
    const features = await featureService.removeFeatureOverride(id, featureKey);
    
    // Log audit event
    await auditService.logAuditEvent(
      id,
      auditService.ACTION_TYPES.FEATURE_DISABLED,
      previousEnabled ? 'enabled' : 'disabled',
      'reverted to plan default',
      req.user.id
    );
    
    res.json({
      message: `Feature override removed, reverted to plan default`,
      features
    });
  } catch (error) {
    console.error('Error removing feature override:', error);
    res.status(500).json({ error: error.message || 'Failed to remove feature override' });
  }
});

// Get audit log for a cafe (Super Admin)
app.get('/api/superadmin/cafes/:id/audit-log', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    
    const auditLog = await auditService.getCafeAuditLog(id, limit, offset);
    
    res.json({
      auditLog,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// Get all audit logs (Super Admin)
app.get('/api/superadmin/audit-logs', auth, requireSuperAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const cafeId = req.query.cafe_id ? parseInt(req.query.cafe_id) : null;
    
    const auditLogs = await auditService.getAllAuditLogs(limit, offset, cafeId);
    
    res.json({
      auditLogs,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// DEPRECATED: Toggle a specific module for a cafe (Super Admin override)
// Kept for backward compatibility
app.post('/api/superadmin/cafes/:id/subscription/modules/:module/toggle', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id, module } = req.params;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }
    
    // Get previous state for audit
    const previousEnabled = await featureService.cafeHasFeature(id, module);
    
    // Toggle feature using new service
    const features = await featureService.toggleCafeFeature(id, module, enabled);
    
    // Log audit event
    await auditService.logAuditEvent(
      id,
      enabled ? auditService.ACTION_TYPES.FEATURE_ENABLED : auditService.ACTION_TYPES.FEATURE_DISABLED,
      previousEnabled ? 'enabled' : 'disabled',
      enabled ? 'enabled' : 'disabled',
      req.user.id
    );
    
    res.json({
      message: `Module ${module} ${enabled ? 'enabled' : 'disabled'} successfully`,
      features
    });
  } catch (error) {
    console.error('Error toggling module:', error);
    res.status(500).json({ error: error.message || 'Failed to toggle module' });
  }
});

// ========================
// Cafe-Scoped Subscription Endpoint (for regular users)
// ========================

// Get subscription info for current user's cafe
app.get('/api/subscription', auth, async (req, res) => {
  try {
    if (!req.user || !req.user.cafe_id) {
      return res.status(400).json({ error: 'User must belong to a cafe' });
    }

    const subscription = await subscriptionService.getCafeSubscription(req.user.cafe_id);
    
    if (!subscription) {
      return res.status(404).json({ error: 'Cafe not found' });
    }
    
    // Get resolved features
    const features = await featureService.resolveCafeFeatures(req.user.cafe_id);
    
    res.json({
      subscription,
      features
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// Get cafe features (single source of truth)
app.get('/api/cafe/features', auth, async (req, res) => {
  try {
    if (!req.user || !req.user.cafe_id) {
      return res.status(400).json({ error: 'User must belong to a cafe' });
    }

    const features = await featureService.resolveCafeFeatures(req.user.cafe_id);
    const subscription = await subscriptionService.getCafeSubscription(req.user.cafe_id);
    
    // Debug logging
    if (subscription?.plan === 'PRO') {
      const enabledFeatures = Object.entries(features)
        .filter(([key, enabled]) => enabled)
        .map(([key]) => key);
      console.log(`[API] Cafe ${req.user.cafe_id} (${subscription.plan}): Enabled features:`, enabledFeatures.join(', '));
    }
    
    res.json({
      features,
      plan: subscription?.plan || 'FREE',
      status: subscription?.status || 'active'
    });
  } catch (error) {
    console.error('Error fetching cafe features:', error);
    res.status(500).json({ error: 'Failed to fetch cafe features' });
  }
});

// ========================
// Onboarding Routes
// ========================

// Get onboarding status (for authenticated cafe users)
app.get('/api/onboarding/status', auth, allowOnboardingRoutes, async (req, res) => {
  try {
    if (!req.user || !req.user.cafe_id) {
      return res.status(400).json({ error: 'User must belong to a cafe' });
    }

    // Super Admin doesn't need onboarding
    if (req.user.role === 'superadmin') {
      return res.json({
        is_onboarded: true,
        onboarding_data: null,
        requires_onboarding: false
      });
    }

    const cafe = await Cafe.getById(req.user.cafe_id);
    
    if (!cafe) {
      return res.status(404).json({ error: 'Cafe not found' });
    }

    // Check if onboarding columns exist
    const hasOnboardingColumns = await Cafe.hasOnboardingColumns();
    
    if (!hasOnboardingColumns) {
      // If columns don't exist, assume cafe is onboarded (grandfathered)
      return res.json({
        is_onboarded: true,
        onboarding_data: {},
        requires_onboarding: false,
        migration_required: true
      });
    }

    res.json({
      is_onboarded: Boolean(cafe.is_onboarded),
      onboarding_data: cafe.onboarding_data || {},
      requires_onboarding: !cafe.is_onboarded
    });
  } catch (error) {
    console.error('Error fetching onboarding status:', error);
    res.status(500).json({ error: 'Failed to fetch onboarding status' });
  }
});

// Update onboarding step data (save progress)
app.put('/api/onboarding/step', auth, allowOnboardingRoutes, async (req, res) => {
  try {
    if (!req.user || !req.user.cafe_id) {
      return res.status(400).json({ error: 'User must belong to a cafe' });
    }

    // Super Admin cannot update onboarding
    if (req.user.role === 'superadmin') {
      return res.status(403).json({ error: 'Super Admin does not require onboarding' });
    }

    const { step, data } = req.body;

    if (!step || typeof step !== 'string') {
      return res.status(400).json({ error: 'Step name is required' });
    }

    const cafe = await Cafe.getById(req.user.cafe_id);
    
    if (!cafe) {
      return res.status(404).json({ error: 'Cafe not found' });
    }

    // Merge new step data with existing onboarding data
    const existingData = cafe.onboarding_data || {};
    const updatedData = {
      ...existingData,
      [step]: data,
      last_updated_step: step,
      last_updated_at: new Date().toISOString()
    };

    // Update cafe with new onboarding data
    await Cafe.update(req.user.cafe_id, {
      onboarding_data: updatedData
    });

    res.json({
      message: 'Onboarding step saved successfully',
      onboarding_data: updatedData
    });
  } catch (error) {
    console.error('Error updating onboarding step:', error);
    
    // Check if it's a migration issue
    if (error.message && error.message.includes('Onboarding columns not found')) {
      return res.status(500).json({ 
        error: 'Database migration required',
        message: 'Please run: node migrations/migration-023-add-cafe-onboarding.js',
        code: 'MIGRATION_REQUIRED'
      });
    }
    
    res.status(500).json({ error: 'Failed to update onboarding step' });
  }
});

// Complete onboarding
app.post('/api/onboarding/complete', auth, allowOnboardingRoutes, async (req, res) => {
  try {
    if (!req.user || !req.user.cafe_id) {
      return res.status(400).json({ error: 'User must belong to a cafe' });
    }

    // Super Admin cannot complete onboarding
    if (req.user.role === 'superadmin') {
      return res.status(403).json({ error: 'Super Admin does not require onboarding' });
    }

    // Verify user belongs to the cafe
    const cafe = await Cafe.getById(req.user.cafe_id);
    
    if (!cafe) {
      return res.status(404).json({ error: 'Cafe not found' });
    }

    // Validate that user belongs to this cafe
    if (req.user.cafe_id !== cafe.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Mark onboarding as complete
    await Cafe.update(req.user.cafe_id, {
      is_onboarded: true,
      onboarding_data: {
        ...(cafe.onboarding_data || {}),
        completed_at: new Date().toISOString(),
        completed_by: req.user.id
      }
    });

    res.json({
      message: 'Onboarding completed successfully',
      is_onboarded: true
    });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    
    // Check if it's a migration issue
    if (error.message && error.message.includes('Onboarding columns not found')) {
      return res.status(500).json({ 
        error: 'Database migration required',
        message: 'Please run: node migrations/migration-023-add-cafe-onboarding.js',
        code: 'MIGRATION_REQUIRED'
      });
    }
    
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

// Reset onboarding (Super Admin only)
app.post('/api/superadmin/cafes/:id/reset-onboarding', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const cafe = await Cafe.getById(id);
    
    if (!cafe) {
      return res.status(404).json({ error: 'Cafe not found' });
    }

    // Reset onboarding status
    await Cafe.update(id, {
      is_onboarded: false,
      onboarding_data: null
    });

    res.json({
      message: 'Onboarding reset successfully',
      cafe: await Cafe.getById(id)
    });
  } catch (error) {
    console.error('Error resetting onboarding:', error);
    res.status(500).json({ error: 'Failed to reset onboarding' });
  }
});

// Delete cafe (soft delete - Super Admin only)
app.delete('/api/superadmin/cafes/:id', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await Cafe.delete(id);
    
    res.json({
      message: 'Cafe deleted successfully',
      ...result
    });
  } catch (error) {
    console.error('Error deleting cafe:', error);
    res.status(500).json({ error: error.message || 'Failed to delete cafe' });
  }
});

// Get all users (Super Admin only) - with cafe information
app.get('/api/superadmin/users', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { cafe_id } = req.query;
    
    let users;
    if (cafe_id) {
      users = await User.getAll(parseInt(cafe_id));
    } else {
      // Get all users across all cafes
      const [rows] = await pool.execute(`
        SELECT u.id, u.username, u.email, u.role, u.cafe_id, u.created_at, u.last_login,
               c.slug as cafe_slug, c.name as cafe_name
        FROM users u
        LEFT JOIN cafes c ON u.cafe_id = c.id
        ORDER BY u.created_at DESC
      `);
      users = rows;
    }
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Assign user to cafe (Super Admin only)
app.put('/api/superadmin/users/:id/assign-cafe', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { cafe_id } = req.body;
    
    if (!cafe_id) {
      return res.status(400).json({ error: 'cafe_id is required' });
    }
    
    // Verify user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Super Admin users cannot be assigned to cafes
    if (user.role === 'superadmin') {
      return res.status(400).json({ error: 'Super Admin users cannot be assigned to cafes' });
    }
    
    // Verify cafe exists
    const cafe = await Cafe.getById(cafe_id);
    if (!cafe) {
      return res.status(404).json({ error: 'Cafe not found' });
    }
    
    // Update user's cafe assignment
    await pool.execute(
      'UPDATE users SET cafe_id = ? WHERE id = ?',
      [cafe_id, id]
    );
    
    const updatedUser = await User.findByIdWithCafe(id);
    
    res.json({
      message: 'User assigned to cafe successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error assigning user to cafe:', error);
    res.status(500).json({ error: 'Failed to assign user to cafe' });
  }
});

// Update user (Super Admin only)
app.put('/api/superadmin/users/:id', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, role, cafe_id, is_active } = req.body;
    
    // Verify user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Super Admin users cannot be modified via this endpoint
    if (user.role === 'superadmin' && (role !== 'superadmin' || cafe_id)) {
      return res.status(400).json({ error: 'Super Admin users cannot be modified this way' });
    }
    
    // Build update query dynamically
    const updates = [];
    const params = [];
    
    if (username !== undefined) {
      updates.push('username = ?');
      params.push(username);
    }
    
    if (email !== undefined) {
      // Check if email is already taken by another user
      const existingUser = await User.findByEmail(email);
      if (existingUser && existingUser.id !== parseInt(id)) {
        return res.status(400).json({ error: 'Email already in use' });
      }
      updates.push('email = ?');
      params.push(email);
    }
    
    if (role !== undefined && role !== 'superadmin') {
      updates.push('role = ?');
      params.push(role);
    }
    
    if (cafe_id !== undefined && user.role !== 'superadmin') {
      // Verify cafe exists if cafe_id is provided
      if (cafe_id) {
        const cafe = await Cafe.getById(cafe_id);
        if (!cafe) {
          return res.status(404).json({ error: 'Cafe not found' });
        }
      }
      updates.push('cafe_id = ?');
      params.push(cafe_id || null);
    }
    
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = NOW()');
    params.push(id);
    
    await pool.execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    
    const updatedUser = await User.findByIdWithCafe(id);
    
    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete/Disable user (Super Admin only)
app.delete('/api/superadmin/users/:id', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Super Admin users cannot be deleted
    if (user.role === 'superadmin') {
      return res.status(400).json({ error: 'Super Admin users cannot be deleted' });
    }
    
    // Soft delete: set is_active to false
    await pool.execute(
      'UPDATE users SET is_active = 0, updated_at = NOW() WHERE id = ?',
      [id]
    );
    
    res.json({
      message: 'User disabled successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ========================
// Cafe-Scoped User Management (Cafe Admin only)
// ========================

// Get all users for the current cafe (Cafe Admin only)
app.get('/api/users', auth, adminAuth, async (req, res) => {
  try {
    // Verify user is admin and has cafe_id
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    
    if (!req.user.cafe_id) {
      return res.status(403).json({ error: 'Access denied. User must belong to a cafe.' });
    }
    
    // Get all users for this cafe
    const users = await User.getAll(req.user.cafe_id);
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching cafe users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create new user in the current cafe (Cafe Admin only)
app.post('/api/users', auth, adminAuth, async (req, res) => {
  try {
    // Verify user is admin and has cafe_id
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    
    if (!req.user.cafe_id) {
      return res.status(403).json({ error: 'Access denied. User must belong to a cafe.' });
    }
    
    const { username, email, password, role } = req.body;
    
    // Validate input
    if (!username || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    // Verify role is valid (not superadmin, and must be cafe role)
    const validRoles = ['admin', 'chef', 'reception'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin, chef, or reception' });
    }
    
    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    // Create new user with cafe assignment
    const user = await User.create({ 
      username, 
      email, 
      password, 
      role,
      cafe_id: req.user.cafe_id
    });
    
    const userWithCafe = await User.findByIdWithCafe(user.id);
    
    res.status(201).json({
      message: 'User created successfully',
      user: userWithCafe
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user in the current cafe (Cafe Admin only)
app.put('/api/users/:id', auth, adminAuth, async (req, res) => {
  try {
    // Verify user is admin and has cafe_id
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    
    if (!req.user.cafe_id) {
      return res.status(403).json({ error: 'Access denied. User must belong to a cafe.' });
    }
    
    const { id } = req.params;
    const { username, email, role, password, is_active } = req.body;
    
    // Verify user exists and belongs to the same cafe
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Ensure user belongs to the same cafe
    if (targetUser.cafe_id !== req.user.cafe_id) {
      return res.status(403).json({ error: 'Access denied. User does not belong to your cafe.' });
    }
    
    // Prevent modifying superadmin users
    if (targetUser.role === 'superadmin') {
      return res.status(400).json({ error: 'Cannot modify superadmin users' });
    }
    
    // Build update query dynamically
    const updates = [];
    const params = [];
    
    if (username !== undefined) {
      updates.push('username = ?');
      params.push(username);
    }
    
    if (email !== undefined) {
      // Check if email is already taken by another user
      const existingUser = await User.findByEmail(email);
      if (existingUser && existingUser.id !== parseInt(id)) {
        return res.status(400).json({ error: 'Email already in use' });
      }
      updates.push('email = ?');
      params.push(email);
    }
    
    if (role !== undefined) {
      // Verify role is valid (not superadmin)
      const validRoles = ['admin', 'chef', 'reception'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be admin, chef, or reception' });
      }
      updates.push('role = ?');
      params.push(role);
    }
    
    if (password !== undefined && password.length > 0) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      updates.push('password = ?');
      params.push(hashedPassword);
    }
    
    // Check if is_active column exists
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'is_active'
    `);
    
    if (is_active !== undefined && columns.length > 0) {
      updates.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = NOW()');
    params.push(id);
    
    await pool.execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    
    const updatedUser = await User.findByIdWithCafe(id);
    
    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete/Disable user in the current cafe (Cafe Admin only)
app.delete('/api/users/:id', auth, adminAuth, async (req, res) => {
  try {
    // Verify user is admin and has cafe_id
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    
    if (!req.user.cafe_id) {
      return res.status(403).json({ error: 'Access denied. User must belong to a cafe.' });
    }
    
    const { id } = req.params;
    
    // Verify user exists and belongs to the same cafe
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Ensure user belongs to the same cafe
    if (targetUser.cafe_id !== req.user.cafe_id) {
      return res.status(403).json({ error: 'Access denied. User does not belong to your cafe.' });
    }
    
    // Prevent deleting superadmin users
    if (targetUser.role === 'superadmin') {
      return res.status(400).json({ error: 'Cannot delete superadmin users' });
    }
    
    // Prevent deleting yourself
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    // Check if is_active column exists
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'is_active'
    `);
    
    if (columns.length > 0) {
      // Soft delete: set is_active to false
      await pool.execute(
        'UPDATE users SET is_active = 0, updated_at = NOW() WHERE id = ?',
        [id]
      );
    } else {
      // Hard delete if is_active column doesn't exist
      await User.delete(id);
    }
    
    res.json({
      message: 'User disabled successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ========================
// Cafe-Scoped Analytics (Cafe Admin/Manager only)
// ========================

// Get analytics overview (Cafe Admin/Manager only)
app.get('/api/analytics/overview', auth, requireFeature('analytics'), async (req, res) => {
  try {
    // Verify user has cafe_id
    if (!req.user.cafe_id) {
      return res.status(403).json({ error: 'Access denied. User must belong to a cafe.' });
    }
    
    // Verify role (admin or manager if exists)
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ error: 'Access denied. Admin or manager privileges required.' });
    }
    
    const cafeId = req.user.cafe_id;
    
    // Check if cafe_daily_metrics table exists
    const [tableExists] = await pool.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'cafe_daily_metrics'
    `);
    
    if (tableExists.length === 0) {
      // Return empty metrics if table doesn't exist yet
      return res.json({
        orders: {
          total: 0,
          today: 0,
          this_month: 0
        },
        revenue: {
          total: 0,
          today: 0,
          this_month: 0
        },
        customers: {
          total: 0,
          new_this_month: 0,
          returning: 0
        }
      });
    }
    
    // Get aggregated metrics from cafe_daily_metrics
    const totals = await CafeDailyMetrics.getTotals(cafeId);
    const today = await CafeDailyMetrics.getToday(cafeId);
    const thisMonth = await CafeDailyMetrics.getThisMonth(cafeId);
    
    // Customer metrics (still query raw data as it's not aggregated daily)
    const [customersColumns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'customers' 
      AND COLUMN_NAME = 'cafe_id'
    `);
    
    let customerMetrics = {
      total: 0,
      new_this_month: 0,
      returning: 0
    };
    
    if (customersColumns.length > 0) {
      const [totalCustomers] = await pool.execute(
        'SELECT COUNT(*) as count FROM customers WHERE cafe_id = ?',
        [cafeId]
      );
      const [customersThisMonth] = await pool.execute(
        'SELECT COUNT(*) as count FROM customers WHERE cafe_id = ? AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())',
        [cafeId]
      );
      
      // Returning customers = customers with more than 1 order
      const [returningCustomers] = await pool.execute(
        `SELECT COUNT(*) as count 
         FROM (
           SELECT c.id 
           FROM customers c
           INNER JOIN orders o ON c.id = o.customer_id
           WHERE c.cafe_id = ? AND o.cafe_id = ?
           GROUP BY c.id
           HAVING COUNT(o.id) > 1
         ) as returning`,
        [cafeId, cafeId]
      );
      
      customerMetrics = {
        total: totalCustomers[0].count,
        new_this_month: customersThisMonth[0].count,
        returning: returningCustomers.length || 0
      };
    }
    
    res.json({
      orders: {
        total: totals.total_orders,
        today: today.total_orders,
        this_month: thisMonth.total_orders
      },
      revenue: {
        total: totals.total_revenue,
        today: today.completed_revenue,
        this_month: thisMonth.total_revenue
      },
      customers: customerMetrics
    });
  } catch (error) {
    logger.error('Error fetching analytics overview:', error);
    res.status(500).json({ error: 'Failed to fetch analytics overview' });
  }
});

// Get analytics trends (Cafe Admin/Manager only)
app.get('/api/analytics/trends', auth, requireFeature('analytics'), async (req, res) => {
  try {
    // Verify user has cafe_id
    if (!req.user.cafe_id) {
      return res.status(403).json({ error: 'Access denied. User must belong to a cafe.' });
    }
    
    // Verify role
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ error: 'Access denied. Admin or manager privileges required.' });
    }
    
    const cafeId = req.user.cafe_id;
    const { days = 30 } = req.query; // Default to last 30 days
    
    // Check if cafe_daily_metrics table exists
    const [tableExists] = await pool.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'cafe_daily_metrics'
    `);
    
    if (tableExists.length === 0) {
      return res.json({
        orders: [],
        revenue: []
      });
    }
    
    // Calculate date range
    const endDate = new Date().toISOString().split('T')[0];
    const startDateObj = new Date();
    startDateObj.setDate(startDateObj.getDate() - parseInt(days));
    const startDate = startDateObj.toISOString().split('T')[0];
    
    // Get daily metrics from aggregated table
    const dailyMetrics = await CafeDailyMetrics.getDateRange(cafeId, startDate, endDate);
    
    // Format for frontend
    const orders = dailyMetrics.map(metric => ({
      date: metric.date,
      count: metric.total_orders
    }));
    
    const revenue = dailyMetrics.map(metric => ({
      date: metric.date,
      amount: metric.completed_revenue
    }));
    
    res.json({
      orders,
      revenue
    });
  } catch (error) {
    logger.error('Error fetching analytics trends:', error);
    res.status(500).json({ error: 'Failed to fetch analytics trends' });
  }
});

// Get customer analytics (Cafe Admin/Manager only)
app.get('/api/analytics/customers', auth, requireFeature('analytics'), async (req, res) => {
  try {
    // Verify user has cafe_id
    if (!req.user.cafe_id) {
      return res.status(403).json({ error: 'Access denied. User must belong to a cafe.' });
    }
    
    // Verify role
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ error: 'Access denied. Admin or manager privileges required.' });
    }
    
    const cafeId = req.user.cafe_id;
    
    // Check if cafe_id columns exist
    const [customersColumns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'customers' 
      AND COLUMN_NAME = 'cafe_id'
    `);
    
    if (customersColumns.length === 0) {
      return res.json({
        total: 0,
        new_this_month: 0,
        active: 0,
        returning: 0
      });
    }
    
    const [totalCustomers] = await pool.execute(
      'SELECT COUNT(*) as count FROM customers WHERE cafe_id = ?',
      [cafeId]
    );
    
    const [customersThisMonth] = await pool.execute(
      'SELECT COUNT(*) as count FROM customers WHERE cafe_id = ? AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())',
      [cafeId]
    );
    
    const [activeCustomers] = await pool.execute(
      'SELECT COUNT(*) as count FROM customers WHERE cafe_id = ? AND is_active = TRUE',
      [cafeId]
    );
    
    // Returning customers = customers with more than 1 order
    const [returningCustomers] = await pool.execute(
      `SELECT COUNT(*) as count 
       FROM (
         SELECT c.id 
         FROM customers c
         INNER JOIN orders o ON c.id = o.customer_id
         WHERE c.cafe_id = ? AND o.cafe_id = ?
         GROUP BY c.id
         HAVING COUNT(o.id) > 1
       ) as returning`,
      [cafeId, cafeId]
    );
    
    res.json({
      total: totalCustomers[0].count,
      new_this_month: customersThisMonth[0].count,
      active: activeCustomers[0].count,
      returning: returningCustomers.length || 0
    });
  } catch (error) {
    console.error('Error fetching customer analytics:', error);
    res.status(500).json({ error: 'Failed to fetch customer analytics' });
  }
});

// ========================
// Global System Settings (Super Admin only)
// ========================

// Note: Global system settings can be added here when needed
// For now, cafe-specific settings are managed per-cafe above

// Login user
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email with cafe information
    const user = await User.findByIdWithCafe((await User.findByEmail(email))?.id);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Validate password
    const userWithPassword = await User.findByEmail(email);
    const isValidPassword = await User.validatePassword(userWithPassword, password);
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

    // Prepare response with cafe information
    const responseData = {
      message: 'Login successful',
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        role: user.role,
        cafe_id: user.cafe_id,
        cafe_slug: user.cafe_slug,
        cafe_name: user.cafe_name
      },
      token
    };

    res.json(responseData);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Get current user profile
app.get('/api/auth/profile', auth, async (req, res) => {
  try {
    // Get user with cafe information
    const user = await User.findByIdWithCafe(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        role: user.role,
        cafe_id: user.cafe_id,
        cafe_slug: user.cafe_slug,
        cafe_name: user.cafe_name
      }
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
      process.env.FRONTEND_URL,
      process.env.ADMIN_URL || 'http://localhost:3001',
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
// Supports both old pattern (no cafe) and new pattern (with cafe)
app.get('/api/menu', auth, requireActiveSubscription, requireFeature('menu_management'), async (req, res) => {
  try {
    let cafeId = null;
    
    // Try to get cafeId from user if available
    if (req.user) {
      const userWithCafe = await User.findByIdWithCafe(req.user.id);
      if (userWithCafe && userWithCafe.cafe_id) {
        cafeId = userWithCafe.cafe_id;
      }
    }
    
    // If no cafeId and user is not superadmin, try to get from default cafe
    if (!cafeId) {
      try {
        const defaultCafe = await Cafe.getBySlug('default');
        if (defaultCafe) {
          cafeId = defaultCafe.id;
        }
      } catch (error) {
        // Cafe table might not exist yet
      }
    }
    
    const menuItems = await MenuItem.getAll(cafeId);
    res.json(menuItems);
  } catch (error) {
    console.error('Error fetching menu items:', error);
    res.status(500).json({ error: 'Failed to fetch menu items' });
  }
});

// Get menu items grouped by category
// Supports both old pattern (no cafe) and new pattern (with cafe)
app.get('/api/menu/grouped', auth, requireActiveSubscription, requireFeature('menu_management'), async (req, res) => {
  try {
    let cafeId = null;
    
    // Try to get cafeId from user if available
    if (req.user) {
      const userWithCafe = await User.findByIdWithCafe(req.user.id);
      if (userWithCafe && userWithCafe.cafe_id) {
        cafeId = userWithCafe.cafe_id;
      }
    }
    
    // If no cafeId and user is not superadmin, try to get from default cafe
    if (!cafeId) {
      try {
        const defaultCafe = await Cafe.getBySlug('default');
        if (defaultCafe) {
          cafeId = defaultCafe.id;
        }
      } catch (error) {
        // Cafe table might not exist yet
      }
    }
    
    const menuItems = await MenuItem.getGroupedByCategory(cafeId);
    res.json(menuItems);
  } catch (error) {
    console.error('Error fetching menu items grouped:', error);
    res.status(500).json({ error: 'Failed to fetch menu items' });
  }
});

// Add new menu item
app.post('/api/menu', auth, requireActiveSubscription, requireFeature('menu_management'), async (req, res) => {
  try {
    const { category_id, name, description, price, sort_order, image_url } = req.body;
    
    if (!category_id || !name || !price) {
      return res.status(400).json({ error: 'Category, name and price are required' });
    }

    let cafeId = null;
    
    // Try to get cafeId from user if available
    if (req.user) {
      const userWithCafe = await User.findByIdWithCafe(req.user.id);
      if (userWithCafe && userWithCafe.cafe_id) {
        cafeId = userWithCafe.cafe_id;
      }
    }
    
    // If no cafeId, try to get from default cafe
    if (!cafeId) {
      try {
        const defaultCafe = await Cafe.getBySlug('default');
        if (defaultCafe) {
          cafeId = defaultCafe.id;
        }
      } catch (error) {
        // Cafe table might not exist yet
      }
    }

    const newItem = {
      category_id,
      name: name.trim(),
      description: description ? description.trim() : '',
      price: parseFloat(price),
      sort_order: sort_order || 0,
      image_url: image_url || null,
      cafe_id: cafeId
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
    const { category_id, name, description, price, sort_order, is_active, image_url } = req.body;
    
    if (!category_id || !name || !price) {
      return res.status(400).json({ error: 'Category, name and price are required' });
    }

    const updatedItem = await MenuItem.update(id, {
      category_id,
      name: name.trim(),
      description: description ? description.trim() : '',
      price: parseFloat(price),
      sort_order: sort_order || 0,
      is_available: is_active !== undefined ? is_active : true,
      image_url: image_url || null
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
    // Return both show_tax_in_menu flag and tax_rate for customer menu
    res.json({
      show_tax_in_menu: taxSettings.show_tax_in_menu,
      tax_rate: taxSettings.tax_rate
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

// Get current cafe settings
app.get('/api/cafe-settings', async (req, res) => {
  try {
    const cafeSettings = await CafeSettings.getCurrent();
    res.json(cafeSettings);
  } catch (error) {
    console.error('Error fetching cafe settings:', error);
    res.status(500).json({ error: 'Failed to fetch cafe settings' });
  }
});

// Update cafe settings
app.put('/api/cafe-settings', auth, async (req, res) => {
  try {
    const { 
      cafe_name, logo_url, address, phone, email, website, opening_hours, description,
      show_kitchen_tab, show_customers_tab, show_payment_methods_tab, show_menu_tab, show_inventory_tab, show_history_tab, show_menu_images,
      chef_show_kitchen_tab, chef_show_menu_tab, chef_show_inventory_tab, chef_show_history_tab,
      chef_can_edit_orders, chef_can_view_customers, chef_can_view_payments,
      reception_show_kitchen_tab, reception_show_menu_tab, reception_show_inventory_tab, reception_show_history_tab,
      reception_can_edit_orders, reception_can_view_customers, reception_can_view_payments, reception_can_create_orders,
      admin_can_access_settings, admin_can_manage_users, admin_can_view_reports, admin_can_manage_inventory, admin_can_manage_menu,
      enable_thermal_printer, default_printer_type, printer_name, printer_port, printer_baud_rate, auto_print_new_orders, print_order_copies,
      light_primary_color, light_secondary_color, light_accent_color, light_background_color, light_text_color, light_surface_color,
      dark_primary_color, dark_secondary_color, dark_accent_color, dark_background_color, dark_text_color, dark_surface_color,
      color_scheme, primary_color, secondary_color, accent_color
    } = req.body;
    
    if (!cafe_name) {
      return res.status(400).json({ error: 'Cafe name is required' });
    }

    // Validate that all required fields are present
    const requiredFields = ['cafe_name'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        missingFields 
      });
    }

    // Test database connection before proceeding
    try {
      const testConnection = await pool.getConnection();
      testConnection.release();
    } catch (dbError) {
      console.error('Database connection test failed:', dbError);
      return res.status(500).json({ 
        error: 'Database connection failed',
        details: dbError.message 
      });
    }

    const updatedSettings = await CafeSettings.update({
      cafe_name: cafe_name.trim(),
      logo_url: logo_url || '/images/palm-cafe-logo.png',
      address: address || '',
      phone: phone || '',
      email: email || '',
      website: website || '',
      opening_hours: opening_hours || '',
      description: description || '',
      show_kitchen_tab: show_kitchen_tab !== undefined ? show_kitchen_tab : true,
      show_customers_tab: show_customers_tab !== undefined ? show_customers_tab : true,
      show_payment_methods_tab: show_payment_methods_tab !== undefined ? show_payment_methods_tab : true,
      show_menu_tab: show_menu_tab !== undefined ? show_menu_tab : true,
      show_inventory_tab: show_inventory_tab !== undefined ? show_inventory_tab : true,
      show_history_tab: show_history_tab !== undefined ? show_history_tab : true,
      show_menu_images: show_menu_images !== undefined ? show_menu_images : true,
      chef_show_kitchen_tab: chef_show_kitchen_tab !== undefined ? chef_show_kitchen_tab : true,
      chef_show_menu_tab: chef_show_menu_tab !== undefined ? chef_show_menu_tab : false,
      chef_show_inventory_tab: chef_show_inventory_tab !== undefined ? chef_show_inventory_tab : false,
      chef_show_history_tab: chef_show_history_tab !== undefined ? chef_show_history_tab : true,
      chef_can_edit_orders: chef_can_edit_orders !== undefined ? chef_can_edit_orders : true,
      chef_can_view_customers: chef_can_view_customers !== undefined ? chef_can_view_customers : false,
      chef_can_view_payments: chef_can_view_payments !== undefined ? chef_can_view_payments : false,
      reception_show_kitchen_tab: reception_show_kitchen_tab !== undefined ? reception_show_kitchen_tab : true,
      reception_show_menu_tab: reception_show_menu_tab !== undefined ? reception_show_menu_tab : false,
      reception_show_inventory_tab: reception_show_inventory_tab !== undefined ? reception_show_inventory_tab : false,
      reception_show_history_tab: reception_show_history_tab !== undefined ? reception_show_history_tab : true,
      reception_can_edit_orders: reception_can_edit_orders !== undefined ? reception_can_edit_orders : true,
      reception_can_view_customers: reception_can_view_customers !== undefined ? reception_can_view_customers : true,
      reception_can_view_payments: reception_can_view_payments !== undefined ? reception_can_view_payments : true,
      reception_can_create_orders: reception_can_create_orders !== undefined ? reception_can_create_orders : true,
      admin_can_access_settings: admin_can_access_settings !== undefined ? admin_can_access_settings : false,
      admin_can_manage_users: admin_can_manage_users !== undefined ? admin_can_manage_users : false,
      admin_can_view_reports: admin_can_view_reports !== undefined ? admin_can_view_reports : true,
      admin_can_manage_inventory: admin_can_manage_inventory !== undefined ? admin_can_manage_inventory : true,
      admin_can_manage_menu: admin_can_manage_menu !== undefined ? admin_can_manage_menu : true,
      enable_thermal_printer: enable_thermal_printer !== undefined ? enable_thermal_printer : false,
      default_printer_type: default_printer_type || 'system',
      printer_name: printer_name || null,
      printer_port: printer_port || null,
      printer_baud_rate: printer_baud_rate || 9600,
      auto_print_new_orders: auto_print_new_orders !== undefined ? auto_print_new_orders : false,
      print_order_copies: print_order_copies || 1,
      color_scheme: color_scheme || 'default',
      primary_color: primary_color || '#75826b',
      secondary_color: secondary_color || '#153059',
      accent_color: accent_color || '#e0a066',
      light_primary_color: light_primary_color || '#3B82F6',
      light_secondary_color: light_secondary_color || '#6B7280',
      light_accent_color: light_accent_color || '#10B981',
      light_background_color: light_background_color || '#FFFFFF',
      light_text_color: light_text_color || '#1F2937',
      light_surface_color: light_surface_color || '#F9FAFB',
      dark_primary_color: dark_primary_color || '#60A5FA',
      dark_secondary_color: dark_secondary_color || '#9CA3AF',
      dark_accent_color: dark_accent_color || '#34D399',
      dark_background_color: dark_background_color || '#111827',
      dark_text_color: dark_text_color || '#F9FAFB',
      dark_surface_color: dark_surface_color || '#1F2937',
      changed_by: req.user.username
    });

    res.json(updatedSettings);
  } catch (error) {
    console.error('Error updating cafe settings:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to update cafe settings',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get cafe settings history
app.get('/api/cafe-settings/history', auth, async (req, res) => {
  try {
    const history = await CafeSettings.getHistory();
    res.json(history);
  } catch (error) {
    console.error('Error fetching cafe settings history:', error);
    res.status(500).json({ error: 'Failed to fetch cafe settings history' });
  }
});

// Upload cafe logo
app.post('/api/cafe-settings/logo', auth, imageUpload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No logo file uploaded' });
    }

    // Validate file type
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Only image files are allowed' });
    }

    // Generate unique filename
    const fileExtension = path.extname(req.file.originalname);
    const fileName = `cafe-logo-${Date.now()}${fileExtension}`;
    const filePath = path.join(__dirname, 'public', 'images', fileName);

    // Ensure directory exists
    const uploadDir = path.dirname(filePath);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Save file
    fs.writeFileSync(filePath, req.file.buffer);

    // Update cafe settings with new logo URL
    const logoUrl = `/images/${fileName}`;
    const updatedSettings = await CafeSettings.updateLogo(logoUrl);

    res.json({ 
      success: true, 
      logo_url: logoUrl,
      message: 'Logo uploaded successfully' 
    });
  } catch (error) {
    console.error('Error uploading logo:', error);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

// Upload menu item image
app.post('/api/menu/upload-image', auth, imageUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    // Validate file type
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Only image files are allowed' });
    }

    // Generate unique filename
    const fileExtension = path.extname(req.file.originalname);
    const fileName = `menu-item-${Date.now()}${fileExtension}`;
    const filePath = path.join(__dirname, 'public', 'images', fileName);

    // Ensure directory exists
    const uploadDir = path.dirname(filePath);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Save file
    fs.writeFileSync(filePath, req.file.buffer);

    // Return the image URL
    const imageUrl = `/images/${fileName}`;

    res.json({ 
      success: true, 
      image_url: imageUrl,
      message: 'Image uploaded successfully' 
    });
  } catch (error) {
    console.error('Error uploading menu item image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
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
app.post('/api/invoices', auth, async (req, res) => {
  try {
    const { customerName, customerPhone, customerEmail, tableNumber, paymentMethod, items, tipAmount, pointsRedeemed, date, splitPayment, splitPaymentMethod, splitAmount, extraCharge, extraChargeNote } = req.body;
    
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
    const extraChargeNum = parseFloat(extraCharge) || 0;
    const total = subtotal + taxCalculation.taxAmount + tipAmountNum - pointsDiscount + extraChargeNum;

    // Handle split payment validation - only admins can use split payment
    const splitPaymentEnabled = Boolean(splitPayment);
    const splitAmountNum = parseFloat(splitAmount) || 0;
    const splitPaymentMethodStr = splitPaymentMethod || 'upi';
    
    if (splitPaymentEnabled) {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Split payment is only available for administrators' });
      }
      
      if (splitAmountNum <= 0) {
        return res.status(400).json({ error: 'Split payment amount must be greater than 0' });
      }
      if (splitAmountNum >= total) {
        return res.status(400).json({ error: 'Split payment amount cannot be greater than or equal to total amount' });
      }
    }

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
      table_number: tableNumber || null,
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
      split_payment: splitPaymentEnabled,
      split_payment_method: splitPaymentMethodStr,
      split_amount: splitAmountNum,
      extra_charge: extraChargeNum,
      extra_charge_note: extraChargeNote || null,
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

    // Get cafe_id from order, user, or default cafe
    let cafeId = null;
    if (createdOrder && createdOrder.cafe_id) {
      cafeId = createdOrder.cafe_id;
    } else if (req.user && req.user.cafe_id) {
      cafeId = req.user.cafe_id;
    } else {
      // Try to get default cafe
      try {
        const defaultCafe = await Cafe.getBySlug('default');
        if (defaultCafe) {
          cafeId = defaultCafe.id;
        }
      } catch (error) {
        // Cafe table might not exist yet, ignore
      }
    }

    const invoiceData = {
      invoiceNumber,
      order_id: createdOrder.id,
      customerName,
      customerPhone,
      paymentMethod: paymentMethod || 'cash',
      splitPayment: splitPaymentEnabled,
      splitPaymentMethod: splitPaymentMethodStr,
      splitAmount: splitAmountNum,
      items,
      subtotal,
      taxAmount: taxCalculation.taxAmount,
      tipAmount: tipAmountNum,
      total,
      date: date || new Date().toISOString(),
      cafe_id: cafeId
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

// Get invoice by order number
app.get('/api/invoices/order/:orderNumber', async (req, res) => {
  try {
    const { orderNumber } = req.params;
    
    const invoice = await Invoice.getByOrderNumber(orderNumber);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found for this order' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice by order number:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
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
app.get('/api/inventory', auth, requireActiveSubscription, requireFeature('inventory'), async (req, res) => {
  try {
    const inventory = await Inventory.getAll();
    res.json(inventory);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// Create new inventory item
app.post('/api/inventory', auth, requireActiveSubscription, requireFeature('inventory'), async (req, res) => {
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
const generateThermalPrintContent = async (order) => {
  // Get cafe settings for dynamic content
  let cafeSettings = {
    cafe_name: 'Our Cafe'
  };
  try {
    const settings = await CafeSettings.getCurrent();
    if (settings) {
      cafeSettings = settings;
    }
  } catch (error) {
    console.error('Error fetching cafe settings for thermal print:', error);
  }

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
  content += `        ${cafeSettings.cafe_name.toUpperCase()}\n`;
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
app.get('/api/orders', auth, requireActiveSubscription, async (req, res) => {
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

// Create customer order (public endpoint)
app.post('/api/customer/orders', async (req, res) => {
  try {
    const { customerName, customerPhone, customerEmail, tableNumber, paymentMethod, items, tipAmount, pointsRedeemed, date, pickupOption } = req.body;
    
    if (!customerName || !items || items.length === 0) {
      return res.status(400).json({ error: 'Customer name and items are required' });
    }

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
          notes: 'Auto-created from customer order'
        });
      }
    }

    // Create order data
    const orderData = {
      customer_name: customerName,
      customer_email: customerEmail || null,
      customer_phone: customerPhone,
      table_number: tableNumber || null,
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
      split_payment: false, // Customers cannot use split payment
      split_payment_method: null,
      split_amount: 0,
      extra_charge: 0,
      extra_charge_note: null,
      notes: pickupOption === 'delivery' ? 'Delivery order' : 'Pickup order'
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

    res.status(201).json({
      orderNumber: createdOrder.order_number,
      orderId: createdOrder.id,
      customerName,
      customerPhone,
      items,
      subtotal,
      taxAmount: taxCalculation.taxAmount,
      tipAmount: tipAmountNum,
      total,
      status: 'pending'
    });
  } catch (error) {
    console.error('Error creating customer order:', error);
    res.status(500).json({ error: 'Failed to create order' });
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
    
    // Broadcast order update via WebSocket
    if (global.wsManager) {
      global.wsManager.broadcastOrderStatusUpdate(updatedOrder);
    }
    
    // Award loyalty points when order is completed (only if not already awarded)
    let loyaltyUpdate = null;
    if (status === 'completed' && currentOrder.status !== 'completed' && updatedOrder.customer_id && !currentOrder.points_awarded) {
      try {
        // Calculate points earned (1 point per 10 INR spent)
        const pointsEarned = Math.floor(updatedOrder.final_amount / 10);
        
        // Update customer loyalty data - pass pointsEarned as pointsChange to override automatic calculation
        const updatedCustomer = await Customer.updateLoyaltyData(updatedOrder.customer_id, updatedOrder.final_amount, pointsEarned);
        
        // Mark points as awarded in the order
        await Order.markPointsAwarded(id);
        
        loyaltyUpdate = {
          pointsEarned,
          newTotalPoints: updatedCustomer.loyalty_points,
          message: `Awarded ${pointsEarned} loyalty points for completed order`
        };
        
      } catch (loyaltyError) {
        console.error('Error awarding loyalty points:', loyaltyError);
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

// Update order details
app.put('/api/orders/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const orderData = req.body;
    
    if (!orderData) {
      return res.status(400).json({ error: 'Order data is required' });
    }

    const updatedOrder = await Order.update(id, orderData);
    
    // Broadcast order update via WebSocket
    if (global.wsManager) {
      global.wsManager.broadcastOrderStatusUpdate(updatedOrder);
    }
    
    res.json(updatedOrder);
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Create new order
app.post('/api/orders', auth, requireActiveSubscription, async (req, res) => {
  try {
    const orderData = req.body;
    
    if (!orderData.items || orderData.items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    const newOrder = await Order.create(orderData);
    
    // Broadcast new order via WebSocket
    if (global.wsManager) {
      global.wsManager.broadcastNewOrder(newOrder);
    }
    
    res.status(201).json(newOrder);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Create test order (for debugging)
app.post('/api/orders/test', auth, async (req, res) => {
  try {
    // First, let's get available menu items
    const menuItems = await MenuItem.getAll();
    
    if (menuItems.length === 0) {
      return res.status(400).json({ error: 'No menu items available. Please add menu items first.' });
    }
    
    // Use the first available menu item
    const firstItem = menuItems[0];
    const secondItem = menuItems[1] || firstItem; // Use first item twice if only one exists
    
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
    
    const newOrder = await Order.create(testOrder);
    
    // Broadcast new test order via WebSocket
    if (global.wsManager) {
      global.wsManager.broadcastNewOrder(newOrder);
    }
    
    res.status(201).json(newOrder);
  } catch (error) {
    console.error('Error creating test order:', error);
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
    const printContent = await generateThermalPrintContent(order);
    
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
// Search customers by phone for login (POST with encrypted payload)
app.post('/api/customer/login', async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    const customer = await Customer.findByEmailOrPhone(null, phone);
    
    if (customer) {
      // Return customer data without sensitive information like phone number
      const sanitizedCustomer = {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        address: customer.address,
        date_of_birth: customer.date_of_birth,
        loyalty_points: customer.loyalty_points,
        total_spent: customer.total_spent,
        visit_count: customer.visit_count,
        first_visit_date: customer.first_visit_date,
        last_visit_date: customer.last_visit_date,
        is_active: customer.is_active,
        notes: customer.notes,
        created_at: customer.created_at,
        updated_at: customer.updated_at
      };
      res.json(sanitizedCustomer);
    } else {
      res.status(404).json({ error: 'Customer not found' });
    }
  } catch (error) {
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

// Update customer profile (public endpoint - customers can update their own details)
app.put('/api/customer/profile', async (req, res) => {
  try {
    const { id, name, email, address, date_of_birth } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }
    
    if (!name) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    // Verify customer exists
    const existingCustomer = await Customer.getById(id);
    if (!existingCustomer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customerData = {
      name: name.trim(),
      email: email ? email.trim() : null,
      address: address ? address.trim() : null,
      date_of_birth: date_of_birth || null
    };

    const customer = await Customer.update(id, customerData);
    
    // Return sanitized customer data (without phone number for security)
    const sanitizedCustomer = {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      address: customer.address,
      date_of_birth: customer.date_of_birth,
      loyalty_points: customer.loyalty_points,
      total_spent: customer.total_spent,
      visit_count: customer.visit_count,
      first_visit_date: customer.first_visit_date,
      last_visit_date: customer.last_visit_date,
      is_active: customer.is_active,
      notes: customer.notes,
      created_at: customer.created_at,
      updated_at: customer.updated_at
    };
    
    res.json(sanitizedCustomer);
  } catch (error) {
    console.error('Error updating customer profile:', error);
    res.status(500).json({ error: 'Failed to update customer profile' });
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

// Global error handler middleware (must be last)
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(isDevelopment && { stack: err.stack, details: err })
  });
});

// 404 handler for undefined routes
app.use((req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Route not found' });
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

    // Create HTTP server
    const server = http.createServer(app);
    
    // Initialize WebSocket manager
    const wsManager = new WebSocketManager(server);
    
    // Make WebSocket manager available globally for broadcasting updates
    global.wsManager = wsManager;
    
    // Start server
    server.listen(PORT, HOST, () => {
      logger.info(`Cafe Management server running on ${HOST}:${PORT}`);
      logger.info(`API available at http://${HOST}:${PORT}/api`);
      logger.info(`WebSocket available at ws://${HOST}:${PORT}/ws/orders`);
      logger.info(`Local access: http://${HOST}:${PORT}/api`);
      logger.info('Database connected and initialized successfully');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // In production, you might want to exit the process
  // For now, we'll just log it
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Exit the process as the application is in an undefined state
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

startServer(); 