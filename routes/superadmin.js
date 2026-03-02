const { pool } = require('../config/database');
const Cafe = require('../models/cafe');
const User = require('../models/user');
const CafeSettings = require('../models/cafeSettings');
const CafeMetrics = require('../models/cafeMetrics');
const CafeDailyMetrics = require('../models/cafeDailyMetrics');
const Feature = require('../models/feature');
const subscriptionService = require('../services/subscriptionService');
const featureService = require('../services/featureService');
const auditService = require('../services/auditService');
const impersonationService = require('../services/impersonationService');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { auth, adminAuth, JWT_SECRET } = require('../middleware/auth');
const { validateCafeAccess, requireCafeMembership, requireSuperAdmin } = require('../middleware/cafeAuth');
const { requireFeature, requireActiveSubscription } = require('../middleware/subscriptionAuth');
const { requireOnboarding, allowOnboardingRoutes } = require('../middleware/onboardingAuth');
const logger = require('../config/logger');
const MAX_LIST_LIMIT = 100;

module.exports = function registerSuperadmin(app) {
// Get all cafes (Super Admin only) - Base route, no params
app.get('/api/superadmin/cafes', auth, requireSuperAdmin, async (req, res) => {
  try {
    const cafes = await Cafe.getAll();
    res.json(cafes);
  } catch (error) {
    logger.error('Error fetching cafes:', error);
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
    logger.error('Error creating cafe:', error);
    res.status(500).json({ error: error.message || 'Failed to create cafe' });
  }
});

// Get active cafes only (Super Admin only) - Specific path segment
app.get('/api/superadmin/cafes/active', auth, requireSuperAdmin, async (req, res) => {
  try {
    const cafes = await Cafe.getActive();
    res.json(cafes);
  } catch (error) {
    logger.error('Error fetching active cafes:', error);
    res.status(500).json({ error: 'Failed to fetch active cafes' });
  }
});

// Get cafe metrics overview (Super Admin only) - Specific path segment
app.get('/api/superadmin/cafes/metrics/overview', auth, requireSuperAdmin, async (req, res) => {
  try {
    const cafesWithMetrics = await CafeMetrics.getAllCafesMetrics();
    res.json(cafesWithMetrics);
  } catch (error) {
    logger.error('Error fetching cafes metrics overview:', error);
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
    logger.error('Error fetching cafe users:', error);
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
    logger.error('Error creating cafe user:', error);
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
    logger.error('Error fetching cafe metrics:', error);
    res.status(500).json({ error: 'Failed to fetch cafe metrics' });
  }
});

// Get cafe settings (Super Admin only) - Specific path with param + segment
app.get('/api/superadmin/cafes/:id/settings', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const cafeId = parseInt(id, 10);
    
    if (isNaN(cafeId)) {
      return res.status(400).json({ error: 'Invalid cafe ID' });
    }
    
    // Verify cafe exists
    const cafe = await Cafe.getById(cafeId);
    if (!cafe) {
      return res.status(404).json({ error: 'Cafe not found' });
    }
    
    // Verify the cafe ID matches
    if (cafe.id !== cafeId) {
      logger.error(`[GET /api/superadmin/cafes/:id/settings] Cafe ID mismatch: requested ${cafeId}, got ${cafe.id}`);
      return res.status(500).json({ error: 'Cafe ID mismatch' });
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
          [cafeId]
        );
        
        if (rows.length > 0) {
          // Verify the settings belong to the correct cafe
          if (rows[0].cafe_id !== cafeId) {
            logger.error(`[GET /api/superadmin/cafes/:id/settings] Settings cafe_id mismatch: requested ${cafeId}, got ${rows[0].cafe_id}`);
            settings = null;
          } else {
            settings = rows[0];
          }
        } else {
          settings = null;
        }
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
      logger.error('Error fetching cafe settings:', error);
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
    logger.error('Error fetching cafe settings:', error);
    res.status(500).json({ error: 'Failed to fetch cafe settings' });
  }
});

// Update cafe settings (Super Admin only) - Specific path with param + segment
app.put('/api/superadmin/cafes/:id/settings', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const cafeId = parseInt(id, 10);
    
    if (isNaN(cafeId)) {
      return res.status(400).json({ error: 'Invalid cafe ID' });
    }
    
    const settingsData = req.body;
    
    // Verify cafe exists
    const cafe = await Cafe.getById(cafeId);
    if (!cafe) {
      return res.status(404).json({ error: 'Cafe not found' });
    }
    
    // Verify the cafe ID matches
    if (cafe.id !== cafeId) {
      logger.error(`[PUT /api/superadmin/cafes/:id/settings] Cafe ID mismatch: requested ${cafeId}, got ${cafe.id}`);
      return res.status(500).json({ error: 'Cafe ID mismatch' });
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
      'SELECT id, cafe_id FROM cafe_settings WHERE cafe_id = ? AND is_active = TRUE',
      [cafeId]
    );
    
    if (existing.length > 0) {
      // Verify existing settings belong to the correct cafe
      if (existing[0].cafe_id !== cafeId) {
        logger.error(`[PUT /api/superadmin/cafes/:id/settings] Existing settings cafe_id mismatch: requested ${cafeId}, got ${existing[0].cafe_id}`);
        return res.status(500).json({ error: 'Settings cafe_id mismatch' });
      }
      
      // Update existing settings
      const updateFields = Object.keys(settingsData)
        .filter(key => key !== 'id' && key !== 'cafe_id' && key !== 'created_at' && key !== 'updated_at')
        .map(key => `${key} = ?`)
        .join(', ');
      
      const updateValues = Object.keys(settingsData)
        .filter(key => key !== 'id' && key !== 'cafe_id' && key !== 'created_at' && key !== 'updated_at')
        .map(key => settingsData[key]);
      
      updateValues.push(cafeId);
      
      await pool.execute(
        `UPDATE cafe_settings SET ${updateFields}, updated_at = CURRENT_TIMESTAMP WHERE cafe_id = ? AND is_active = TRUE`,
        updateValues
      );
    } else {
      // Check if there are inactive settings we can reactivate
      const [inactiveSettings] = await pool.execute(
        'SELECT id FROM cafe_settings WHERE cafe_id = ? ORDER BY created_at DESC LIMIT 1',
        [cafeId]
      );
      
      if (inactiveSettings.length > 0) {
        // Reactivate and update existing inactive settings
        const updateFields = Object.keys(settingsData)
          .filter(key => key !== 'id' && key !== 'cafe_id' && key !== 'created_at' && key !== 'updated_at')
          .map(key => `${key} = ?`)
          .join(', ');
        
        const updateValues = Object.keys(settingsData)
          .filter(key => key !== 'id' && key !== 'cafe_id' && key !== 'created_at' && key !== 'updated_at')
          .map(key => settingsData[key]);
        
        updateValues.push(cafeId);
        
        await pool.execute(
          `UPDATE cafe_settings SET ${updateFields}, is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE cafe_id = ?`,
          updateValues
        );
      } else {
        // No existing settings at all, create new one
        const fields = ['cafe_id', ...Object.keys(settingsData).filter(key => key !== 'id' && key !== 'cafe_id' && key !== 'created_at' && key !== 'updated_at')];
        const placeholders = fields.map(() => '?').join(', ');
        const values = [cafeId, ...Object.keys(settingsData)
          .filter(key => key !== 'id' && key !== 'cafe_id' && key !== 'created_at' && key !== 'updated_at')
          .map(key => settingsData[key])];
        
        await pool.execute(
          `INSERT INTO cafe_settings (${fields.join(', ')}, is_active, created_at, updated_at) VALUES (${placeholders}, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          values
        );
      }
    }
    
    // Fetch updated settings
    const [updated] = await pool.execute(
      'SELECT * FROM cafe_settings WHERE cafe_id = ? AND is_active = TRUE ORDER BY created_at DESC LIMIT 1',
      [cafeId]
    );
    
    if (updated.length > 0 && updated[0].cafe_id !== cafeId) {
      logger.error(`[PUT /api/superadmin/cafes/:id/settings] Updated settings cafe_id mismatch: requested ${cafeId}, got ${updated[0].cafe_id}`);
      return res.status(500).json({ error: 'Updated settings cafe_id mismatch' });
    }
    
    res.json({
      message: 'Cafe settings updated successfully',
      settings: updated[0] || {}
    });
  } catch (error) {
    logger.error('Error updating cafe settings:', error);
    res.status(500).json({ error: 'Failed to update cafe settings' });
  }
});

// Get cafe by ID (Super Admin only) - Generic parameterized route - MUST be LAST
app.get('/api/superadmin/cafes/:id', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const cafeId = parseInt(id, 10);
    
    if (isNaN(cafeId)) {
      return res.status(400).json({ error: 'Invalid cafe ID' });
    }
    
    const cafe = await Cafe.getById(cafeId);
    
    if (!cafe) {
      return res.status(404).json({ error: 'Cafe not found' });
    }
    
    // Verify the cafe ID matches
    if (cafe.id !== cafeId) {
      logger.error(`[GET /api/superadmin/cafes/:id] Cafe ID mismatch: requested ${cafeId}, got ${cafe.id}`);
      return res.status(500).json({ error: 'Cafe ID mismatch' });
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
          
          // Explicitly filter by cafe_id to ensure correct data
          const [settings] = await pool.execute(
            `SELECT ${selectColumns}, cafe_id FROM cafe_settings WHERE cafe_id = ? AND is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
            [cafeId]
          );
          
          if (settings.length > 0) {
            // Verify the settings belong to the correct cafe
            if (settings[0].cafe_id !== cafeId) {
              logger.error(`[GET /api/superadmin/cafes/:id] Settings cafe_id mismatch: requested ${cafeId}, got ${settings[0].cafe_id}`);
            } else {
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
      }
    } catch (settingsError) {
      // Ignore settings errors, just return cafe data
      logger.warn('Error fetching cafe branding:', settingsError);
    }
    
    res.json(cafe);
  } catch (error) {
    logger.error('Error fetching cafe:', error);
    res.status(500).json({ error: 'Failed to fetch cafe' });
  }
});

// Update cafe (Super Admin only)
app.put('/api/superadmin/cafes/:id', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const cafeId = parseInt(id, 10);
    
    if (isNaN(cafeId)) {
      return res.status(400).json({ error: 'Invalid cafe ID' });
    }
    
    const { slug, name, description, logo_url, address, phone, email, website, is_active, primary_color, accent_color } = req.body;

    // Validate slug format if provided
    if (slug && !/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Slug must contain only lowercase letters, numbers, and hyphens' });
    }

    // Check if slug already exists (excluding current cafe)
    if (slug) {
      const slugExists = await Cafe.slugExists(slug, cafeId);
      if (slugExists) {
        return res.status(400).json({ error: 'A cafe with this slug already exists' });
      }
    }

    const cafe = await Cafe.update(cafeId, {
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
        const [cafeIdColumns] = await pool.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'cafe_settings' 
          AND COLUMN_NAME = 'cafe_id'
        `);
        
        if (cafeIdColumns.length > 0) {
          // Get current cafe settings
          const [existing] = await pool.execute(
            'SELECT * FROM cafe_settings WHERE cafe_id = ? AND is_active = TRUE ORDER BY created_at DESC LIMIT 1',
            [cafeId]
          );
          
          // Verify existing settings belong to the correct cafe
          if (existing.length > 0 && existing[0].cafe_id !== cafeId) {
            logger.error(`[PUT /api/superadmin/cafes/:id] Existing settings cafe_id mismatch: requested ${cafeId}, got ${existing[0].cafe_id}`);
          } else {
            // Check which columns exist in cafe_settings table
            const [allColumns] = await pool.execute(`
              SELECT COLUMN_NAME 
              FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = 'cafe_settings'
            `);
            
            const existingColumns = allColumns.map(col => col.COLUMN_NAME);
          
          const brandingUpdates = {};
          // Only include columns that actually exist in the database
          if (primary_color !== undefined && existingColumns.includes('primary_color')) {
            brandingUpdates.primary_color = primary_color;
          }
          if (accent_color !== undefined && existingColumns.includes('accent_color')) {
            brandingUpdates.accent_color = accent_color;
          }
          if (logo_url !== undefined && existingColumns.includes('logo_url')) {
            brandingUpdates.logo_url = logo_url;
          }
          
            if (Object.keys(brandingUpdates).length > 0) {
              if (existing.length > 0 && existing[0].cafe_id === cafeId) {
                // Update existing active settings
                const updateFields = Object.keys(brandingUpdates).map(key => `${key} = ?`).join(', ');
                const updateValues = Object.values(brandingUpdates);
                updateValues.push(cafeId);
                
                await pool.execute(
                  `UPDATE cafe_settings SET ${updateFields}, updated_at = CURRENT_TIMESTAMP WHERE cafe_id = ? AND is_active = TRUE`,
                  updateValues
                );
              } else {
                // Check if there are any inactive settings we can reactivate
                const [inactiveSettings] = await pool.execute(
                  'SELECT id FROM cafe_settings WHERE cafe_id = ? ORDER BY created_at DESC LIMIT 1',
                  [cafeId]
                );
                
                if (inactiveSettings.length > 0) {
                  // Reactivate and update existing inactive settings
                  const updateFields = Object.keys(brandingUpdates).map(key => `${key} = ?`).join(', ');
                  const updateValues = Object.values(brandingUpdates);
                  updateValues.push(cafeId);
                  
                  await pool.execute(
                    `UPDATE cafe_settings SET ${updateFields}, is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE cafe_id = ?`,
                    updateValues
                  );
                } else {
                  // No existing settings at all, create new one
                  const fields = ['cafe_id', 'cafe_name', ...Object.keys(brandingUpdates)];
                  const placeholders = fields.map(() => '?').join(', ');
                  const values = [cafeId, cafe.name, ...Object.values(brandingUpdates)];
                  
                  await pool.execute(
                    `INSERT INTO cafe_settings (${fields.join(', ')}, is_active, created_at, updated_at) VALUES (${placeholders}, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                    values
                  );
                }
              }
            }
          }
        }
      } catch (settingsError) {
        // Log error but don't fail the cafe update
        logger.warn('Error updating cafe branding settings:', settingsError);
      }
    }

    res.json({
      message: 'Cafe updated successfully',
      cafe
    });
  } catch (error) {
    logger.error('Error updating cafe:', error);
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
    logger.error('Error fetching subscription:', error);
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
    logger.error('Error updating subscription:', error);
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
    logger.error('Error fetching feature details:', error);
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
    logger.error('Error toggling feature:', error);
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
    logger.error('Error removing feature override:', error);
    res.status(500).json({ error: error.message || 'Failed to remove feature override' });
  }
});

// Get audit log for a cafe (Super Admin)
app.get('/api/superadmin/cafes/:id/audit-log', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const auditLog = await auditService.getCafeAuditLog(id, limit, offset);
    
    res.json({
      auditLog,
      limit,
      offset
    });
  } catch (error) {
    logger.error('Error fetching audit log:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// Get all audit logs (Super Admin)
app.get('/api/superadmin/audit-logs', auth, requireSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const cafeId = req.query.cafe_id ? parseInt(req.query.cafe_id) : null;
    const auditLogs = await auditService.getAllAuditLogs(limit, offset, cafeId);
    
    res.json({
      auditLogs,
      limit,
      offset
    });
  } catch (error) {
    logger.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// ========================
// Super Admin Impersonation Routes
// ========================

// Start impersonation (Super Admin only)
app.post('/api/superadmin/impersonate-cafe', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { cafeSlug } = req.body;

    if (!cafeSlug) {
      return res.status(400).json({ error: 'Cafe slug is required' });
    }

    // Prevent nested impersonation
    if (req.impersonation && req.impersonation.isImpersonating) {
      return res.status(403).json({ error: 'Cannot impersonate while already impersonating' });
    }

    // Get cafe by slug
    const cafe = await Cafe.getBySlug(cafeSlug);
    if (!cafe) {
      return res.status(404).json({ error: 'Cafe not found' });
    }

    if (!cafe.is_active) {
      return res.status(403).json({ error: 'Cannot impersonate inactive cafe' });
    }

    // Get IP address and user agent for audit
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || null;
    const userAgent = req.headers['user-agent'] || null;

    // Log impersonation start
    await impersonationService.logImpersonationEvent(
      req.user.id,
      req.user.email,
      cafe.id,
      cafe.slug,
      cafe.name,
      impersonationService.ACTION_TYPES.IMPERSONATION_STARTED,
      ipAddress,
      userAgent
    );

    // Generate new JWT token with impersonation data
    const now = Math.floor(Date.now() / 1000);
    const impersonationToken = jwt.sign(
      {
        userId: req.user.id, // Original Super Admin ID
        impersonatedCafeId: cafe.id,
        impersonatedCafeSlug: cafe.slug,
        impersonatedRole: 'admin', // Impersonate as cafe admin
        originalRole: req.user.role,
        isImpersonation: true,
        iat: now,
        exp: now + (24 * 60 * 60) // 24 hours
      },
      JWT_SECRET,
      {
        algorithm: 'HS256'
      }
    );

    // Get cafe settings for context
    const cafeSettings = await CafeSettings.getCurrent();

    res.json({
      success: true,
      message: `Now impersonating ${cafe.name}`,
      token: impersonationToken,
      impersonation: {
        cafeId: cafe.id,
        cafeSlug: cafe.slug,
        cafeName: cafe.name,
        impersonatedRole: 'admin'
      },
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        role: 'admin', // Return admin role for UI
        cafe_id: cafe.id,
        cafe_slug: cafe.slug,
        cafe_name: cafe.name
      }
    });
  } catch (error) {
    logger.error('Error starting impersonation:', error);
    res.status(500).json({ error: 'Failed to start impersonation' });
  }
});

// Exit impersonation (Super Admin only)
app.post('/api/superadmin/exit-impersonation', auth, requireSuperAdmin, async (req, res) => {
  try {
    // Check if actually impersonating
    if (!req.impersonation || !req.impersonation.isImpersonating) {
      return res.status(400).json({ error: 'Not currently impersonating' });
    }

    // Get IP address and user agent for audit
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || null;
    const userAgent = req.headers['user-agent'] || null;

    // Log impersonation end
    await impersonationService.logImpersonationEvent(
      req.user.id,
      req.user.email,
      req.impersonation.cafeId,
      req.impersonation.cafeSlug,
      req.impersonation.cafeName,
      impersonationService.ACTION_TYPES.IMPERSONATION_ENDED,
      ipAddress,
      userAgent
    );

    // Generate new JWT token without impersonation data (restore original)
    const now = Math.floor(Date.now() / 1000);
    const originalToken = jwt.sign(
      {
        userId: req.user.id,
        iat: now,
        exp: now + (24 * 60 * 60) // 24 hours
      },
      JWT_SECRET,
      {
        algorithm: 'HS256'
      }
    );

    // Get original user with cafe info (should be null for superadmin)
    const user = await User.findByIdWithCafe(req.user.id);

    res.json({
      success: true,
      message: 'Impersonation ended. Restored to Super Admin context.',
      token: originalToken,
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
    logger.error('Error exiting impersonation:', error);
    res.status(500).json({ error: 'Failed to exit impersonation' });
  }
});

// Get impersonation audit log (Super Admin only)
app.get('/api/superadmin/impersonation-audit-logs', auth, requireSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const superAdminId = req.query.super_admin_id ? parseInt(req.query.super_admin_id) : null;
    const auditLogs = await impersonationService.getImpersonationAuditLog(superAdminId, limit, offset);
    
    res.json({
      auditLogs,
      limit,
      offset
    });
  } catch (error) {
    logger.error('Error fetching impersonation audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch impersonation audit logs' });
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
    logger.error('Error toggling module:', error);
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
    logger.error('Error fetching subscription:', error);
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
      logger.info(`[API] Cafe ${req.user.cafe_id} (${subscription.plan}): Enabled features:`, enabledFeatures.join(', '));
    }
    
    res.json({
      features,
      plan: subscription?.plan || 'FREE',
      status: subscription?.status || 'active'
    });
  } catch (error) {
    logger.error('Error fetching cafe features:', error);
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
    logger.error('Error fetching onboarding status:', error);
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
    logger.error('Error updating onboarding step:', error);
    
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
    logger.error('Error completing onboarding:', error);
    
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
    logger.error('Error resetting onboarding:', error);
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
    logger.error('Error deleting cafe:', error);
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
    logger.error('Error fetching users:', error);
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
    logger.error('Error assigning user to cafe:', error);
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
    logger.error('Error updating user:', error);
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
    logger.error('Error deleting user:', error);
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
    logger.error('Error fetching cafe users:', error);
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
    logger.error('Error creating user:', error);
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
    logger.error('Error updating user:', error);
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
    logger.error('Error deleting user:', error);
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
    logger.error('Error fetching customer analytics:', error);
    res.status(500).json({ error: 'Failed to fetch customer analytics' });
  }
});

// Backup endpoint (protected)
  app.post('/api/backup', auth, adminAuth, async (req, res) => {
    try {
      const DatabaseBackup = require('../scripts/backup');
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
};
