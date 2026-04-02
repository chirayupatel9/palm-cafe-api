import { Application, Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database';
import Cafe from '../models/cafe';
import User from '../models/user';
import CafeSettings from '../models/cafeSettings';
import CafeMetrics from '../models/cafeMetrics';
import CafeDailyMetrics from '../models/cafeDailyMetrics';
import * as subscriptionService from '../services/subscriptionService';
import * as featureService from '../services/featureService';
import * as auditService from '../services/auditService';
import * as impersonationService from '../services/impersonationService';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { auth, adminAuth, JWT_SECRET } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/cafeAuth';
import { requireFeature, requireActiveSubscription } from '../middleware/subscriptionAuth';
import { allowOnboardingRoutes } from '../middleware/onboardingAuth';
import logger from '../config/logger';

const MAX_LIST_LIMIT = 100;

export default function registerSuperadmin(app: Application): void {
  // Get all cafes (Super Admin only) - Base route, no params
  app.get('/api/superadmin/cafes', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const cafes = await Cafe.getAll();
      res.json(cafes);
    } catch (error) {
      logger.error('Error fetching cafes:', error as Error);
      res.status(500).json({ error: 'Failed to fetch cafes' });
    }
  });

  // Create new cafe (Super Admin only) - Base route, no params
  app.post('/api/superadmin/cafes', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        slug?: string;
        name?: string;
        description?: string;
        logo_url?: string;
        address?: string;
        phone?: string;
        email?: string;
        website?: string;
      };
      const { slug, name, description, logo_url, address, phone, email, website } = body;

      if (!slug || !name) {
        return res.status(400).json({ error: 'Slug and name are required' });
      }

      if (!/^[a-z0-9-]+$/.test(slug)) {
        return res.status(400).json({ error: 'Slug must contain only lowercase letters, numbers, and hyphens' });
      }

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
      logger.error('Error creating cafe:', error as Error);
      res.status(500).json({ error: (error as Error).message || 'Failed to create cafe' });
    }
  });

  // Get active cafes only (Super Admin only)
  app.get('/api/superadmin/cafes/active', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const cafes = await Cafe.getActive();
      res.json(cafes);
    } catch (error) {
      logger.error('Error fetching active cafes:', error as Error);
      res.status(500).json({ error: 'Failed to fetch active cafes' });
    }
  });

  // Get cafe metrics overview (Super Admin only)
  app.get('/api/superadmin/cafes/metrics/overview', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const cafesWithMetrics = await CafeMetrics.getAllCafesMetrics();
      res.json(cafesWithMetrics);
    } catch (error) {
      logger.error('Error fetching cafes metrics overview:', error as Error);
      res.status(500).json({ error: 'Failed to fetch cafes metrics overview' });
    }
  });

  // Get cafe users (Super Admin only)
  app.get('/api/superadmin/cafes/:cafeId/users', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const cafeIdStr = req.params.cafeId as string;
      const cafeId = parseInt(cafeIdStr, 10);
      const cafe = await Cafe.getById(cafeId);
      if (!cafe) {
        return res.status(404).json({ error: 'Cafe not found' });
      }
      const users = await User.getAll(cafeId);
      res.json(users);
    } catch (error) {
      logger.error('Error fetching cafe users:', error as Error);
      res.status(500).json({ error: 'Failed to fetch cafe users' });
    }
  });

  // Create cafe user (Super Admin only)
  app.post('/api/superadmin/cafes/:cafeId/users', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const cafeIdStr = req.params.cafeId as string;
      const cafeId = parseInt(cafeIdStr, 10);
      const body = req.body as { username?: string; email?: string; password?: string; role?: string };
      const { username, email, password, role } = body;

      if (!username || !email || !password || !role) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }

      if (role === 'superadmin') {
        return res.status(400).json({ error: 'Cannot create superadmin users via cafe endpoint' });
      }

      const cafe = await Cafe.getById(cafeId);
      if (!cafe) {
        return res.status(404).json({ error: 'Cafe not found' });
      }

      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      const user = await User.create({
        username,
        email,
        password,
        role,
        cafe_id: cafeId
      });

      const userWithCafe = await User.findByIdWithCafe(user.id);

      res.status(201).json({
        message: 'User created successfully',
        user: userWithCafe
      });
    } catch (error) {
      logger.error('Error creating cafe user:', error as Error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  // Get cafe by ID metrics (Super Admin only)
  app.get('/api/superadmin/cafes/:id/metrics', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const cafe = await Cafe.getById(parseInt(id, 10));
      if (!cafe) {
        return res.status(404).json({ error: 'Cafe not found' });
      }
      const metrics = await CafeMetrics.getCafeMetrics(parseInt(id, 10));
      res.json({
        cafe: { id: cafe.id, slug: cafe.slug, name: cafe.name },
        metrics
      });
    } catch (error) {
      logger.error('Error fetching cafe metrics:', error as Error);
      res.status(500).json({ error: 'Failed to fetch cafe metrics' });
    }
  });

  // Get cafe settings (Super Admin only)
  app.get('/api/superadmin/cafes/:id/settings', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const cafeId = parseInt(id, 10);

      if (isNaN(cafeId)) {
        return res.status(400).json({ error: 'Invalid cafe ID' });
      }

      const cafe = await Cafe.getById(cafeId);
      if (!cafe) {
        return res.status(404).json({ error: 'Cafe not found' });
      }

      if (cafe.id !== cafeId) {
        logger.error(`[GET /api/superadmin/cafes/:id/settings] Cafe ID mismatch: requested ${cafeId}, got ${cafe.id}`);
        return res.status(500).json({ error: 'Cafe ID mismatch' });
      }

      try {
        const [columns] = await pool.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'cafe_settings'
          AND COLUMN_NAME = 'cafe_id'
        `) as [RowDataPacket[], unknown];

        const cols = columns as RowDataPacket[];
        let settings: RowDataPacket | null = null;

        if (cols.length > 0) {
          const [rows] = await pool.execute(
            'SELECT * FROM cafe_settings WHERE cafe_id = ? AND is_active = TRUE ORDER BY created_at DESC LIMIT 1',
            [cafeId]
          ) as [RowDataPacket[], unknown];
          const r = (rows as RowDataPacket[]);
          if (r.length > 0) {
            const row = r[0] as RowDataPacket & { cafe_id?: number };
            if (row.cafe_id !== cafeId) {
              logger.error(`[GET /api/superadmin/cafes/:id/settings] Settings cafe_id mismatch: requested ${cafeId}, got ${row.cafe_id}`);
              settings = null;
            } else {
              settings = row;
            }
          }
        } else {
          settings = (await CafeSettings.getCurrent()) as unknown as RowDataPacket | null;
        }

        res.json({
          cafe: { id: cafe.id, slug: cafe.slug, name: cafe.name },
          settings: settings || {}
        });
      } catch (err) {
        logger.error('Error fetching cafe settings:', err as Error);
        res.json({
          cafe: { id: cafe.id, slug: cafe.slug, name: cafe.name },
          settings: {}
        });
      }
    } catch (error) {
      logger.error('Error fetching cafe settings:', error as Error);
      res.status(500).json({ error: 'Failed to fetch cafe settings' });
    }
  });

  // Update cafe settings (Super Admin only)
  app.put('/api/superadmin/cafes/:id/settings', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const cafeId = parseInt(id, 10);

      if (isNaN(cafeId)) {
        return res.status(400).json({ error: 'Invalid cafe ID' });
      }

      const settingsData = req.body as Record<string, unknown>;

      const cafe = await Cafe.getById(cafeId);
      if (!cafe) {
        return res.status(404).json({ error: 'Cafe not found' });
      }

      if (cafe.id !== cafeId) {
        logger.error(`[PUT /api/superadmin/cafes/:id/settings] Cafe ID mismatch: requested ${cafeId}, got ${cafe.id}`);
        return res.status(500).json({ error: 'Cafe ID mismatch' });
      }

      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'cafe_settings'
        AND COLUMN_NAME = 'cafe_id'
      `) as [RowDataPacket[], unknown];

      if ((columns as RowDataPacket[]).length === 0) {
        return res.status(400).json({ error: 'Cafe settings are not yet scoped to cafes. Please run migration first.' });
      }

      const [existing] = await pool.execute(
        'SELECT id, cafe_id FROM cafe_settings WHERE cafe_id = ? AND is_active = TRUE',
        [cafeId]
      ) as [RowDataPacket[], unknown];
      const existingRows = existing as (RowDataPacket & { cafe_id?: number })[];

      if (existingRows.length > 0) {
        if (existingRows[0].cafe_id !== cafeId) {
          logger.error(`[PUT /api/superadmin/cafes/:id/settings] Existing settings cafe_id mismatch`);
          return res.status(500).json({ error: 'Settings cafe_id mismatch' });
        }

        const allowedKeys = Object.keys(settingsData).filter(
          (key) => !['id', 'cafe_id', 'created_at', 'updated_at'].includes(key)
        );
        const updateFields = allowedKeys.map((key) => `${key} = ?`).join(', ');
        const updateValues = allowedKeys.map((key) => settingsData[key]);
        updateValues.push(cafeId);

        await pool.execute(
          `UPDATE cafe_settings SET ${updateFields}, updated_at = CURRENT_TIMESTAMP WHERE cafe_id = ? AND is_active = TRUE`,
          updateValues as (string | number)[]
        );
      } else {
        const [inactiveSettings] = await pool.execute(
          'SELECT id FROM cafe_settings WHERE cafe_id = ? ORDER BY created_at DESC LIMIT 1',
          [cafeId]
        ) as [RowDataPacket[], unknown];

        if ((inactiveSettings as RowDataPacket[]).length > 0) {
          const allowedKeys = Object.keys(settingsData).filter(
            (key) => !['id', 'cafe_id', 'created_at', 'updated_at'].includes(key)
          );
          const updateFields = allowedKeys.map((key) => `${key} = ?`).join(', ');
          const updateValues = allowedKeys.map((key) => settingsData[key]);
          updateValues.push(cafeId);

          await pool.execute(
            `UPDATE cafe_settings SET ${updateFields}, is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE cafe_id = ?`,
            updateValues as (string | number)[]
          );
        } else {
          const fields = ['cafe_id', ...Object.keys(settingsData).filter(
            (key) => !['id', 'cafe_id', 'created_at', 'updated_at'].includes(key)
          )];
          const placeholders = fields.map(() => '?').join(', ');
          const values = [cafeId, ...Object.keys(settingsData)
            .filter((key) => !['id', 'cafe_id', 'created_at', 'updated_at'].includes(key))
            .map((key) => settingsData[key])];

          await pool.execute(
            `INSERT INTO cafe_settings (${fields.join(', ')}, is_active, created_at, updated_at) VALUES (${placeholders}, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            values as (string | number)[]
          );
        }
      }

      const [updated] = await pool.execute(
        'SELECT * FROM cafe_settings WHERE cafe_id = ? AND is_active = TRUE ORDER BY created_at DESC LIMIT 1',
        [cafeId]
      ) as [RowDataPacket[], unknown];
      const updatedRows = updated as (RowDataPacket & { cafe_id?: number })[];

      if (updatedRows.length > 0 && updatedRows[0].cafe_id !== cafeId) {
        logger.error(`[PUT /api/superadmin/cafes/:id/settings] Updated settings cafe_id mismatch`);
        return res.status(500).json({ error: 'Updated settings cafe_id mismatch' });
      }

      if (settingsData.cafe_name != null && String(settingsData.cafe_name).trim() !== '') {
        const trimmedName = String(settingsData.cafe_name).trim();
        try {
          const [cafeUpdateResult] = await pool.execute(
            'UPDATE cafes SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [trimmedName, cafeId]
          ) as [{ affectedRows: number }, unknown];
          if (cafeUpdateResult.affectedRows === 0) {
            logger.warn('[PUT /api/superadmin/cafes/:id/settings] cafes table: no row updated for id', cafeId);
          } else {
            const [cafeRows] = await pool.execute('SELECT slug FROM cafes WHERE id = ?', [cafeId]) as [RowDataPacket[], unknown];
            const cr = cafeRows as (RowDataPacket & { slug?: string })[];
            if (cr.length > 0 && cr[0].slug) {
              Cafe.invalidateSlugCache(cr[0].slug);
            }
          }
        } catch (cafeUpdateErr) {
          logger.error('[PUT /api/superadmin/cafes/:id/settings] Failed to sync cafe name to cafes table:', (cafeUpdateErr as Error).message);
        }
      }

      res.json({
        message: 'Cafe settings updated successfully',
        settings: updatedRows[0] || {}
      });
    } catch (error) {
      logger.error('Error updating cafe settings:', error as Error);
      res.status(500).json({ error: 'Failed to update cafe settings' });
    }
  });

  // Get cafe by ID (Super Admin only) - MUST be after more specific routes
  app.get('/api/superadmin/cafes/:id', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const cafeId = parseInt(id, 10);

      if (isNaN(cafeId)) {
        return res.status(400).json({ error: 'Invalid cafe ID' });
      }

      const cafe = await Cafe.getById(cafeId) as { id: number; slug?: string; name?: string; [k: string]: unknown } | null;
      if (!cafe) {
        return res.status(404).json({ error: 'Cafe not found' });
      }

      if (cafe.id !== cafeId) {
        logger.error(`[GET /api/superadmin/cafes/:id] Cafe ID mismatch: requested ${cafeId}, got ${cafe.id}`);
        return res.status(500).json({ error: 'Cafe ID mismatch' });
      }

      try {
        const [columns] = await pool.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'cafe_settings'
          AND COLUMN_NAME = 'cafe_id'
        `) as [RowDataPacket[], unknown];

        if ((columns as RowDataPacket[]).length > 0) {
          const [colorColumns] = await pool.execute(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'cafe_settings'
            AND COLUMN_NAME IN ('primary_color', 'accent_color', 'logo_url')
          `) as [RowDataPacket[], unknown];
          const colorCols = colorColumns as (RowDataPacket & { COLUMN_NAME: string })[];
          const existingColorColumns = colorCols.map((col) => col.COLUMN_NAME);

          if (existingColorColumns.length > 0) {
            const selectColumns = existingColorColumns.join(', ');
            const [settings] = await pool.execute(
              `SELECT ${selectColumns}, cafe_id FROM cafe_settings WHERE cafe_id = ? AND is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
              [cafeId]
            ) as [RowDataPacket[], unknown];
            const s = settings as (RowDataPacket & { cafe_id?: number; primary_color?: string; accent_color?: string; logo_url?: string })[];
            if (s.length > 0) {
              if (s[0].cafe_id !== cafeId) {
                logger.error(`[GET /api/superadmin/cafes/:id] Settings cafe_id mismatch`);
              } else {
                if (existingColorColumns.includes('primary_color') && s[0].primary_color) cafe.primary_color = s[0].primary_color;
                if (existingColorColumns.includes('accent_color') && s[0].accent_color) cafe.accent_color = s[0].accent_color;
                if (existingColorColumns.includes('logo_url') && s[0].logo_url) cafe.logo_url = s[0].logo_url;
              }
            }
          }
        }
      } catch (settingsError) {
        logger.warn('Error fetching cafe branding:', settingsError);
      }

      res.json(cafe);
    } catch (error) {
      logger.error('Error fetching cafe:', error as Error);
      res.status(500).json({ error: 'Failed to fetch cafe' });
    }
  });

  // Update cafe (Super Admin only)
  app.put('/api/superadmin/cafes/:id', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const cafeId = parseInt(id, 10);

      if (isNaN(cafeId)) {
        return res.status(400).json({ error: 'Invalid cafe ID' });
      }

      const body = req.body as {
        slug?: string;
        name?: string;
        description?: string;
        logo_url?: string;
        address?: string;
        phone?: string;
        email?: string;
        website?: string;
        is_active?: boolean;
        subscription_plan?: string;
        subscription_status?: string;
        enabled_modules?: unknown;
        primary_color?: string;
        accent_color?: string;
      };
      const { slug, name, description, logo_url, address, phone, email, website, is_active, primary_color, accent_color } = body;

      if (slug && !/^[a-z0-9-]+$/.test(slug)) {
        return res.status(400).json({ error: 'Slug must contain only lowercase letters, numbers, and hyphens' });
      }

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
        subscription_plan: body.subscription_plan,
        subscription_status: body.subscription_status,
        enabled_modules: body.enabled_modules
      });

      if (primary_color !== undefined || accent_color !== undefined || logo_url !== undefined) {
        try {
          const [cafeIdColumns] = await pool.execute(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'cafe_settings'
            AND COLUMN_NAME = 'cafe_id'
          `) as [RowDataPacket[], unknown];

          if ((cafeIdColumns as RowDataPacket[]).length > 0) {
            const [existing] = await pool.execute(
              'SELECT * FROM cafe_settings WHERE cafe_id = ? AND is_active = TRUE ORDER BY created_at DESC LIMIT 1',
              [cafeId]
            ) as [RowDataPacket[], unknown];
            const existingRows = existing as (RowDataPacket & { cafe_id?: number })[];

            if (existingRows.length > 0 && existingRows[0].cafe_id !== cafeId) {
              logger.error(`[PUT /api/superadmin/cafes/:id] Existing settings cafe_id mismatch`);
            } else {
              const [allColumns] = await pool.execute(`
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'cafe_settings'
              `) as [RowDataPacket[], unknown];
              const allCols = allColumns as (RowDataPacket & { COLUMN_NAME: string })[];
              const existingColumns = allCols.map((c) => c.COLUMN_NAME);

              const brandingUpdates: Record<string, string | undefined> = {};
              if (primary_color !== undefined && existingColumns.includes('primary_color')) brandingUpdates.primary_color = primary_color;
              if (accent_color !== undefined && existingColumns.includes('accent_color')) brandingUpdates.accent_color = accent_color;
              if (logo_url !== undefined && existingColumns.includes('logo_url')) brandingUpdates.logo_url = logo_url;

              if (Object.keys(brandingUpdates).length > 0) {
                if (existingRows.length > 0 && existingRows[0].cafe_id === cafeId) {
                  const updateFields = Object.keys(brandingUpdates).map((k) => `${k} = ?`).join(', ');
                  const updateValues: (string | number)[] = Object.values(brandingUpdates).filter((v): v is string => v != null);
                  updateValues.push(cafeId);
                  await pool.execute(
                    `UPDATE cafe_settings SET ${updateFields}, updated_at = CURRENT_TIMESTAMP WHERE cafe_id = ? AND is_active = TRUE`,
                    updateValues
                  );
                } else {
                  const [inactiveSettings] = await pool.execute(
                    'SELECT id FROM cafe_settings WHERE cafe_id = ? ORDER BY created_at DESC LIMIT 1',
                    [cafeId]
                  ) as [RowDataPacket[], unknown];

                  if ((inactiveSettings as RowDataPacket[]).length > 0) {
                    const updateFields = Object.keys(brandingUpdates).map((k) => `${k} = ?`).join(', ');
                    const updateValues: (string | number)[] = Object.values(brandingUpdates).filter((v): v is string => v != null);
                    updateValues.push(cafeId);
                    await pool.execute(
                      `UPDATE cafe_settings SET ${updateFields}, is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE cafe_id = ?`,
                      updateValues
                    );
                  } else {
                    const fields = ['cafe_id', 'cafe_name', ...Object.keys(brandingUpdates)];
                    const placeholders = fields.map(() => '?').join(', ');
                    const values: (string | number)[] = [cafeId, cafe.name, ...Object.values(brandingUpdates).filter((v): v is string => v != null)];
                    await pool.execute(
                      `INSERT INTO cafe_settings (${fields.join(', ')}, is_active, created_at, updated_at) VALUES (${placeholders}, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                      values as (string | number)[]
                    );
                  }
                }
              }
            }
          }
        } catch (settingsError) {
          logger.warn('Error updating cafe branding settings:', settingsError as Error);
        }
      }

      res.json({
        message: 'Cafe updated successfully',
        cafe
      });
    } catch (error) {
      logger.error('Error updating cafe:', error as Error);
      res.status(500).json({ error: (error as Error).message || 'Failed to update cafe' });
    }
  });

  // Get subscription info for a cafe
  app.get('/api/superadmin/cafes/:id/subscription', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid cafe ID' });
        return;
      }
      const subscription = await subscriptionService.getCafeSubscription(id);
      if (!subscription) {
        return res.status(404).json({ error: 'Cafe not found' });
      }
      const plans = subscriptionService.getAllPlans();
      const modules = subscriptionService.getAllModules();
      const planFeatures: Record<string, unknown> = {};
      plans.forEach((plan) => {
        planFeatures[plan] = subscriptionService.getPlanFeatures(plan);
      });
      res.json({
        subscription,
        available_plans: plans,
        available_modules: modules,
        plan_features: planFeatures
      });
    } catch (error) {
      logger.error('Error fetching subscription:', error as Error);
      res.status(500).json({ error: 'Failed to fetch subscription' });
    }
  });

  // Update cafe subscription
  app.put('/api/superadmin/cafes/:id/subscription', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid cafe ID' });
        return;
      }
      const body = req.body as { plan?: string; status?: string };
      const { plan, status } = body;

      if (plan === undefined && status === undefined) {
        return res.status(400).json({ error: 'Either plan or status must be provided' });
      }

      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      const updatedCafe = await subscriptionService.updateCafeSubscription(id, { plan, status }, req.user.id);
      const freshCafe = await Cafe.getById(id);
      const freshSubscription = await subscriptionService.getCafeSubscription(id);

      res.json({
        message: 'Subscription updated successfully',
        cafe: freshCafe || updatedCafe,
        subscription: freshSubscription
      });
    } catch (error) {
      logger.error('Error updating subscription:', error as Error);
      res.status(500).json({ error: (error as Error).message || 'Failed to update subscription' });
    }
  });

  // Get feature resolution details for a cafe
  app.get('/api/superadmin/cafes/:id/features', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid cafe ID' });
        return;
      }
      const details = await featureService.getFeatureResolutionDetails(id);
      res.json(details);
    } catch (error) {
      logger.error('Error fetching feature details:', error as Error);
      res.status(500).json({ error: 'Failed to fetch feature details' });
    }
  });

  // Toggle a feature for a cafe
  app.post('/api/superadmin/cafes/:id/features/:featureKey/toggle', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid cafe ID' });
        return;
      }
      const { featureKey } = req.params;
      const body = req.body as { enabled?: boolean };
      const { enabled } = body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
      }

      const previousEnabled = await featureService.cafeHasFeature(id, featureKey);
      const features = await featureService.toggleCafeFeature(id, featureKey, enabled);
      await auditService.logAuditEvent(
        id,
        enabled ? auditService.ACTION_TYPES.FEATURE_ENABLED : auditService.ACTION_TYPES.FEATURE_DISABLED,
        previousEnabled ? 'enabled' : 'disabled',
        enabled ? 'enabled' : 'disabled',
        req.user!.id
      );
      res.json({
        message: `Feature ${featureKey} ${enabled ? 'enabled' : 'disabled'} successfully`,
        features
      });
    } catch (error) {
      logger.error('Error toggling feature:', error as Error);
      res.status(500).json({ error: (error as Error).message || 'Failed to toggle feature' });
    }
  });

  // Remove feature override
  app.delete('/api/superadmin/cafes/:id/features/:featureKey', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid cafe ID' });
        return;
      }
      const { featureKey } = req.params;
      const previousEnabled = await featureService.cafeHasFeature(id, featureKey);
      const features = await featureService.removeFeatureOverride(id, featureKey);
      await auditService.logAuditEvent(
        id,
        auditService.ACTION_TYPES.FEATURE_DISABLED,
        previousEnabled ? 'enabled' : 'disabled',
        'reverted to plan default',
        req.user!.id
      );
      res.json({
        message: 'Feature override removed, reverted to plan default',
        features
      });
    } catch (error) {
      logger.error('Error removing feature override:', error as Error);
      res.status(500).json({ error: 'Failed to remove feature override' });
    }
  });

  // Get audit log for a cafe
  app.get('/api/superadmin/cafes/:id/audit-log', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid cafe ID' });
        return;
      }
      const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, parseInt(String(req.query.limit), 10) || 100));
      const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);
      const auditLog = await auditService.getCafeAuditLog(id, limit, offset);
      res.json({ auditLog, limit, offset });
    } catch (error) {
      logger.error('Error fetching audit log:', error as Error);
      res.status(500).json({ error: 'Failed to fetch audit log' });
    }
  });

  // Get all audit logs
  app.get('/api/superadmin/audit-logs', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, parseInt(String(req.query.limit), 10) || 100));
      const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);
      const cafeId = req.query.cafe_id ? parseInt(String(req.query.cafe_id), 10) : null;
      const auditLogs = await auditService.getAllAuditLogs(limit, offset, cafeId);
      res.json({ auditLogs, limit, offset });
    } catch (error) {
      logger.error('Error fetching audit logs:', error as Error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  // Start impersonation
  app.post('/api/superadmin/impersonate-cafe', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const body = req.body as { cafeSlug?: string };
      const { cafeSlug } = body;

      if (!cafeSlug) {
        return res.status(400).json({ error: 'Cafe slug is required' });
      }

      if (req.impersonation && req.impersonation.isImpersonating) {
        return res.status(403).json({ error: 'Cannot impersonate while already impersonating' });
      }

      const cafe = await Cafe.getBySlug(cafeSlug);
      if (!cafe) {
        return res.status(404).json({ error: 'Cafe not found' });
      }

      if (!cafe.is_active) {
        return res.status(403).json({ error: 'Cannot impersonate inactive cafe' });
      }

      const ipAddress = (req as Request & { ip?: string; connection?: { remoteAddress?: string }; headers: { 'x-forwarded-for'?: string } }).ip
        || (req as Request & { connection?: { remoteAddress?: string } }).connection?.remoteAddress
        || (req.headers as { 'x-forwarded-for'?: string })['x-forwarded-for']
        || null;
      const userAgent = req.headers['user-agent'] || null;

      await impersonationService.logImpersonationEvent(
        req.user!.id,
        req.user!.email,
        cafe.id,
        cafe.slug,
        cafe.name,
        impersonationService.ACTION_TYPES.IMPERSONATION_STARTED,
        ipAddress as string | null,
        userAgent
      );

      const now = Math.floor(Date.now() / 1000);
      const impersonationToken = jwt.sign(
        {
          userId: req.user!.id,
          impersonatedCafeId: cafe.id,
          impersonatedCafeSlug: cafe.slug,
          impersonatedRole: 'admin',
          originalRole: req.user!.role,
          isImpersonation: true,
          iat: now,
          exp: now + 24 * 60 * 60
        },
        JWT_SECRET,
        { algorithm: 'HS256' }
      );

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
          id: req.user!.id,
          username: req.user!.username,
          email: req.user!.email,
          role: 'admin',
          cafe_id: cafe.id,
          cafe_slug: cafe.slug,
          cafe_name: cafe.name
        }
      });
    } catch (error) {
      logger.error('Error starting impersonation:', error as Error);
      res.status(500).json({ error: 'Failed to start impersonation' });
    }
  });

  // Exit impersonation
  app.post('/api/superadmin/exit-impersonation', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.impersonation || !req.impersonation.isImpersonating) {
        return res.status(400).json({ error: 'Not currently impersonating' });
      }

      const ipAddress = (req as Request & { ip?: string; connection?: { remoteAddress?: string } }).ip
        || (req as Request & { connection?: { remoteAddress?: string } }).connection?.remoteAddress
        || (req.headers as { 'x-forwarded-for'?: string })['x-forwarded-for']
        || null;
      const userAgent = req.headers['user-agent'] || null;

      await impersonationService.logImpersonationEvent(
        req.user!.id,
        req.user!.email,
        req.impersonation.cafeId!,
        req.impersonation.cafeSlug!,
        req.impersonation.cafeName!,
        impersonationService.ACTION_TYPES.IMPERSONATION_ENDED,
        ipAddress as string | null,
        userAgent
      );

      const now = Math.floor(Date.now() / 1000);
      const originalToken = jwt.sign(
        { userId: req.user!.id, iat: now, exp: now + 24 * 60 * 60 },
        JWT_SECRET,
        { algorithm: 'HS256' }
      );

      const user = await User.findByIdWithCafe(req.user!.id);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
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
      logger.error('Error exiting impersonation:', error as Error);
      res.status(500).json({ error: 'Failed to exit impersonation' });
    }
  });

  // Get impersonation audit log
  app.get('/api/superadmin/impersonation-audit-logs', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, parseInt(String(req.query.limit), 10) || 100));
      const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);
      const superAdminId = req.query.super_admin_id ? parseInt(String(req.query.super_admin_id), 10) : null;
      const auditLogs = await impersonationService.getImpersonationAuditLog(superAdminId, limit, offset);
      res.json({ auditLogs, limit, offset });
    } catch (error) {
      logger.error('Error fetching impersonation audit logs:', error as Error);
      res.status(500).json({ error: 'Failed to fetch impersonation audit logs' });
    }
  });

  // DEPRECATED: Toggle module (backward compatibility)
  app.post('/api/superadmin/cafes/:id/subscription/modules/:module/toggle', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid cafe ID' });
        return;
      }
      const { module } = req.params;
      const body = req.body as { enabled?: boolean };
      const { enabled } = body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
      }

      const previousEnabled = await featureService.cafeHasFeature(id, module);
      const features = await featureService.toggleCafeFeature(id, module, enabled);
      await auditService.logAuditEvent(
        id,
        enabled ? auditService.ACTION_TYPES.FEATURE_ENABLED : auditService.ACTION_TYPES.FEATURE_DISABLED,
        previousEnabled ? 'enabled' : 'disabled',
        enabled ? 'enabled' : 'disabled',
        req.user!.id
      );
      res.json({
        message: `Module ${module} ${enabled ? 'enabled' : 'disabled'} successfully`,
        features
      });
    } catch (error) {
      logger.error('Error toggling module:', error as Error);
      res.status(500).json({ error: (error as Error).message || 'Failed to toggle module' });
    }
  });

  // Get subscription info for current user's cafe
  app.get('/api/subscription', auth, async (req: Request, res: Response) => {
    try {
      if (!req.user || !req.user.cafe_id) {
        return res.status(400).json({ error: 'User must belong to a cafe' });
      }
      const subscription = await subscriptionService.getCafeSubscription(req.user.cafe_id);
      if (!subscription) {
        return res.status(404).json({ error: 'Cafe not found' });
      }
      const features = await featureService.resolveCafeFeatures(req.user.cafe_id);
      res.json({ subscription, features });
    } catch (error) {
      logger.error('Error fetching subscription:', error as Error);
      res.status(500).json({ error: 'Failed to fetch subscription' });
    }
  });

  // Get cafe features
  app.get('/api/cafe/features', auth, async (req: Request, res: Response) => {
    try {
      if (!req.user || !req.user.cafe_id) {
        return res.status(400).json({ error: 'User must belong to a cafe' });
      }
      const features = await featureService.resolveCafeFeatures(req.user.cafe_id);
      const subscription = await subscriptionService.getCafeSubscription(req.user.cafe_id);
      if (subscription?.plan === 'PRO') {
        const enabledFeatures = Object.entries(features)
          .filter(([, enabled]) => enabled)
          .map(([key]) => key);
        logger.info(`[API] Cafe ${req.user.cafe_id} (${subscription.plan}): Enabled features:`, enabledFeatures.join(', '));
      }
      res.json({
        features,
        plan: subscription?.plan || 'FREE',
        status: subscription?.status || 'active'
      });
    } catch (error) {
      logger.error('Error fetching cafe features:', error as Error);
      res.status(500).json({ error: 'Failed to fetch cafe features' });
    }
  });

  // Get onboarding status
  app.get('/api/onboarding/status', auth, allowOnboardingRoutes, async (req: Request, res: Response) => {
    try {
      if (!req.user || !req.user.cafe_id) {
        return res.status(400).json({ error: 'User must belong to a cafe' });
      }
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
      const hasOnboardingColumns = await Cafe.hasOnboardingColumns();
      if (!hasOnboardingColumns) {
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
      logger.error('Error fetching onboarding status:', error as Error);
      res.status(500).json({ error: 'Failed to fetch onboarding status' });
    }
  });

  // Update onboarding step
  app.put('/api/onboarding/step', auth, allowOnboardingRoutes, async (req: Request, res: Response) => {
    try {
      if (!req.user || !req.user.cafe_id) {
        return res.status(400).json({ error: 'User must belong to a cafe' });
      }
      if (req.user.role === 'superadmin') {
        return res.status(403).json({ error: 'Super Admin does not require onboarding' });
      }
      const body = req.body as { step?: string; data?: unknown };
      const { step, data } = body;

      if (!step || typeof step !== 'string') {
        return res.status(400).json({ error: 'Step name is required' });
      }

      const cafe = await Cafe.getById(req.user.cafe_id);
      if (!cafe) {
        return res.status(404).json({ error: 'Cafe not found' });
      }

      const existingData = (cafe as { onboarding_data?: Record<string, unknown> }).onboarding_data || {};
      const updatedData = {
        ...existingData,
        [step]: data,
        last_updated_step: step,
        last_updated_at: new Date().toISOString()
      };

      await Cafe.update(req.user.cafe_id, { onboarding_data: updatedData } as Record<string, unknown>);

      res.json({
        message: 'Onboarding step saved successfully',
        onboarding_data: updatedData
      });
    } catch (error) {
      logger.error('Error updating onboarding step:', error as Error);
      if ((error as Error).message && (error as Error).message.includes('Onboarding columns not found')) {
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
  app.post('/api/onboarding/complete', auth, allowOnboardingRoutes, async (req: Request, res: Response) => {
    try {
      if (!req.user || !req.user.cafe_id) {
        return res.status(400).json({ error: 'User must belong to a cafe' });
      }
      if (req.user.role === 'superadmin') {
        return res.status(403).json({ error: 'Super Admin does not require onboarding' });
      }
      const cafe = await Cafe.getById(req.user.cafe_id);
      if (!cafe) {
        return res.status(404).json({ error: 'Cafe not found' });
      }
      if (req.user.cafe_id !== cafe.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      await Cafe.update(req.user.cafe_id, {
        is_onboarded: true,
        onboarding_data: {
          ...((cafe as { onboarding_data?: Record<string, unknown> }).onboarding_data || {}),
          completed_at: new Date().toISOString(),
          completed_by: req.user.id
        }
      } as Record<string, unknown>);
      res.json({ message: 'Onboarding completed successfully', is_onboarded: true });
    } catch (error) {
      logger.error('Error completing onboarding:', error as Error);
      if ((error as Error).message && (error as Error).message.includes('Onboarding columns not found')) {
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
  app.post('/api/superadmin/cafes/:id/reset-onboarding', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const cafeId = parseInt(id, 10);
      const cafe = await Cafe.getById(cafeId);
      if (!cafe) {
        return res.status(404).json({ error: 'Cafe not found' });
      }
      await Cafe.update(cafeId, { is_onboarded: false, onboarding_data: null } as Record<string, unknown>);
      res.json({
        message: 'Onboarding reset successfully',
        cafe: await Cafe.getById(cafeId)
      });
    } catch (error) {
      logger.error('Error resetting onboarding:', error as Error);
      res.status(500).json({ error: 'Failed to reset onboarding' });
    }
  });

  // Delete cafe (soft delete)
  app.delete('/api/superadmin/cafes/:id', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const result = await Cafe.delete(parseInt(id, 10));
      res.json({ message: 'Cafe deleted successfully', ...result });
    } catch (error) {
      logger.error('Error deleting cafe:', error as Error);
      res.status(500).json({ error: (error as Error).message || 'Failed to delete cafe' });
    }
  });

  // Get all users (Super Admin only)
  app.get('/api/superadmin/users', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const cafe_id = req.query.cafe_id as string | undefined;
      let users: unknown[];
      if (cafe_id) {
        users = await User.getAll(parseInt(cafe_id, 10));
      } else {
        const [rows] = await pool.execute(`
          SELECT u.id, u.username, u.email, u.role, u.cafe_id, u.created_at, u.last_login,
                 c.slug as cafe_slug, c.name as cafe_name
          FROM users u
          LEFT JOIN cafes c ON u.cafe_id = c.id
          ORDER BY u.created_at DESC
        `) as [RowDataPacket[], unknown];
        users = rows as unknown[];
      }
      res.json(users);
    } catch (error) {
      logger.error('Error fetching users:', error as Error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  // Assign user to cafe
  app.put('/api/superadmin/users/:id/assign-cafe', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const body = req.body as { cafe_id?: number };
      const { cafe_id } = body;

      if (!cafe_id) {
        return res.status(400).json({ error: 'cafe_id is required' });
      }

      const user = await User.findById(parseInt(id, 10));
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (user.role === 'superadmin') {
        return res.status(400).json({ error: 'Super Admin users cannot be assigned to cafes' });
      }

      const cafe = await Cafe.getById(cafe_id);
      if (!cafe) {
        return res.status(404).json({ error: 'Cafe not found' });
      }

      await pool.execute('UPDATE users SET cafe_id = ? WHERE id = ?', [cafe_id, id]);
      const updatedUser = await User.findByIdWithCafe(parseInt(id, 10));
      res.json({
        message: 'User assigned to cafe successfully',
        user: updatedUser
      });
    } catch (error) {
      logger.error('Error assigning user to cafe:', error as Error);
      res.status(500).json({ error: 'Failed to assign user to cafe' });
    }
  });

  /**
   * Reset password for a Super Admin account. Requires the acting superadmin's current password.
   * Other roles continue to use PUT /api/superadmin/users/:id with { password } (no actor check).
   */
  app.post('/api/superadmin/users/:id/reset-superadmin-password', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const targetId = parseInt(req.params.id as string, 10);
      if (!Number.isInteger(targetId) || targetId < 1) {
        return res.status(400).json({ error: 'Invalid user id' });
      }
      const body = req.body as { newPassword?: string; actorPassword?: string };
      const newPassword = body.newPassword != null ? String(body.newPassword).trim() : '';
      const actorPassword = body.actorPassword != null ? String(body.actorPassword) : '';

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }
      if (!actorPassword) {
        return res.status(400).json({ error: 'Your current password is required to confirm this action' });
      }

      const actorId = req.user!.id;
      const actorHash = await User.getPasswordHashById(actorId);
      if (!actorHash || !(await bcrypt.compare(actorPassword, actorHash))) {
        return res.status(403).json({ error: 'Your password is incorrect' });
      }

      const target = await User.findById(targetId);
      if (!target) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (target.role !== 'superadmin') {
        return res.status(400).json({
          error: 'This endpoint is only for Super Admin accounts. Use Manage user for other roles.'
        });
      }

      const hashed = await bcrypt.hash(newPassword, 10);
      await pool.execute('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?', [hashed, targetId]);
      const updatedUser = await User.findByIdWithCafe(targetId);
      logger.info('Superadmin password reset by peer', { targetUserId: targetId, actorUserId: actorId });
      res.json({ message: 'Super Admin password updated successfully', user: updatedUser });
    } catch (error) {
      logger.error('Error resetting superadmin password:', error as Error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // Update user (Super Admin only)
  app.put('/api/superadmin/users/:id', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const body = req.body as {
        username?: string;
        email?: string;
        role?: string;
        cafe_id?: number | null;
        is_active?: boolean;
        password?: string;
      };
      const { username, email, role, cafe_id, is_active, password } = body;

      const user = await User.findById(parseInt(id, 10));
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (user.role === 'superadmin' && (role !== 'superadmin' || cafe_id)) {
        return res.status(400).json({ error: 'Super Admin users cannot be modified this way' });
      }

      const updates: string[] = [];
      const params: unknown[] = [];

      if (password !== undefined && String(password).trim().length > 0) {
        if (user.role === 'superadmin') {
          return res.status(400).json({ error: 'Cannot reset password for Super Admin users' });
        }
        if (String(password).length < 6) {
          return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        updates.push('password = ?');
        params.push(hashedPassword);
      }

      if (username !== undefined) {
        updates.push('username = ?');
        params.push(username);
      }
      if (email !== undefined) {
        const existingUser = await User.findByEmail(email);
        if (existingUser && existingUser.id !== parseInt(id, 10)) {
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
      await pool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params as (string | number)[]);
      const updatedUser = await User.findByIdWithCafe(parseInt(id, 10));
      res.json({ message: 'User updated successfully', user: updatedUser });
    } catch (error) {
      logger.error('Error updating user:', error as Error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  });

  // Delete/Disable user (Super Admin only)
  app.delete('/api/superadmin/users/:id', auth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const user = await User.findById(parseInt(id, 10));
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (user.role === 'superadmin') {
        return res.status(400).json({ error: 'Super Admin users cannot be deleted' });
      }
      await pool.execute('UPDATE users SET is_active = 0, updated_at = NOW() WHERE id = ?', [id]);
      res.json({ message: 'User disabled successfully' });
    } catch (error) {
      logger.error('Error deleting user:', error as Error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // Get all users for the current cafe (Cafe Admin only)
  app.get('/api/users', auth, adminAuth, async (req: Request, res: Response) => {
    try {
      if (req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
      }
      if (!req.user!.cafe_id) {
        return res.status(403).json({ error: 'Access denied. User must belong to a cafe.' });
      }
      const users = await User.getAll(req.user!.cafe_id);
      res.json(users);
    } catch (error) {
      logger.error('Error fetching cafe users:', error as Error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  // Create new user in the current cafe (Cafe Admin only)
  app.post('/api/users', auth, adminAuth, async (req: Request, res: Response) => {
    try {
      if (req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
      }
      if (!req.user!.cafe_id) {
        return res.status(403).json({ error: 'Access denied. User must belong to a cafe.' });
      }
      const body = req.body as { username?: string; email?: string; password?: string; role?: string };
      const { username, email, password, role } = body;

      if (!username || !email || !password || !role) {
        return res.status(400).json({ error: 'All fields are required' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }
      const validRoles = ['admin', 'chef', 'reception'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be admin, chef, or reception' });
      }

      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      const user = await User.create({
        username,
        email,
        password,
        role,
        cafe_id: req.user!.cafe_id
      });
      const userWithCafe = await User.findByIdWithCafe(user.id);
      res.status(201).json({
        message: 'User created successfully',
        user: userWithCafe
      });
    } catch (error) {
      logger.error('Error creating user:', error as Error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  // Update user in the current cafe (Cafe Admin only)
  app.put('/api/users/:id', auth, adminAuth, async (req: Request, res: Response) => {
    try {
      if (req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
      }
      if (!req.user!.cafe_id) {
        return res.status(403).json({ error: 'Access denied. User must belong to a cafe.' });
      }
      const id = req.params.id as string;
      const body = req.body as { username?: string; email?: string; role?: string; password?: string; is_active?: boolean };
      const { username, email, role, password, is_active } = body;

      const targetUser = await User.findById(parseInt(id, 10));
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (targetUser.cafe_id !== req.user!.cafe_id) {
        return res.status(403).json({ error: 'Access denied. User does not belong to your cafe.' });
      }
      if (targetUser.role === 'superadmin') {
        return res.status(400).json({ error: 'Cannot modify superadmin users' });
      }

      const updates: string[] = [];
      const params: unknown[] = [];

      if (username !== undefined) {
        updates.push('username = ?');
        params.push(username);
      }
      if (email !== undefined) {
        const existingUser = await User.findByEmail(email);
        if (existingUser && existingUser.id !== parseInt(id, 10)) {
          return res.status(400).json({ error: 'Email already in use' });
        }
        updates.push('email = ?');
        params.push(email);
      }
      if (role !== undefined) {
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
        const hashedPassword = await bcrypt.hash(password, 10);
        updates.push('password = ?');
        params.push(hashedPassword);
      }

      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'is_active'
      `) as [RowDataPacket[], unknown];
      if (is_active !== undefined && (columns as RowDataPacket[]).length > 0) {
        updates.push('is_active = ?');
        params.push(is_active ? 1 : 0);
      }
      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      updates.push('updated_at = NOW()');
      params.push(id);
      await pool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params as (string | number)[]);
      const updatedUser = await User.findByIdWithCafe(parseInt(id, 10));
      res.json({ message: 'User updated successfully', user: updatedUser });
    } catch (error) {
      logger.error('Error updating user:', error as Error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  });

  // Delete/Disable user in the current cafe (Cafe Admin only)
  app.delete('/api/users/:id', auth, adminAuth, async (req: Request, res: Response) => {
    try {
      if (req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
      }
      if (!req.user!.cafe_id) {
        return res.status(403).json({ error: 'Access denied. User must belong to a cafe.' });
      }
      const id = req.params.id as string;
      const targetUser = await User.findById(parseInt(id, 10));
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (targetUser.cafe_id !== req.user!.cafe_id) {
        return res.status(403).json({ error: 'Access denied. User does not belong to your cafe.' });
      }
      if (targetUser.role === 'superadmin') {
        return res.status(400).json({ error: 'Cannot delete superadmin users' });
      }
      if (parseInt(id, 10) === req.user!.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'is_active'
      `) as [RowDataPacket[], unknown];
      if ((columns as RowDataPacket[]).length > 0) {
        await pool.execute('UPDATE users SET is_active = 0, updated_at = NOW() WHERE id = ?', [id]);
      } else {
        await User.delete(parseInt(id, 10));
      }
      res.json({ message: 'User disabled successfully' });
    } catch (error) {
      logger.error('Error deleting user:', error as Error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // Get analytics overview
  app.get('/api/analytics/overview', auth, requireFeature('analytics'), async (req: Request, res: Response) => {
    try {
      if (!req.user!.cafe_id) {
        return res.status(403).json({ error: 'Access denied. User must belong to a cafe.' });
      }
      if (req.user!.role !== 'admin' && req.user!.role !== 'manager') {
        return res.status(403).json({ error: 'Access denied. Admin or manager privileges required.' });
      }
      const cafeId = req.user!.cafe_id;

      const [tableExists] = await pool.execute(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'cafe_daily_metrics'
      `) as [RowDataPacket[], unknown];

      if ((tableExists as RowDataPacket[]).length === 0) {
        return res.json({
          orders: { total: 0, today: 0, this_month: 0 },
          revenue: { total: 0, today: 0, this_month: 0 },
          customers: { total: 0, new_this_month: 0, returning: 0 }
        });
      }

      const totals = await CafeDailyMetrics.getTotals(cafeId);
      const today = await CafeDailyMetrics.getToday(cafeId);
      const thisMonth = await CafeDailyMetrics.getThisMonth(cafeId);

      const [customersColumns] = await pool.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'customers'
        AND COLUMN_NAME = 'cafe_id'
      `) as [RowDataPacket[], unknown];

      let customerMetrics = { total: 0, new_this_month: 0, returning: 0 };
      if ((customersColumns as RowDataPacket[]).length > 0) {
        const [totalCustomers] = await pool.execute(
          'SELECT COUNT(*) as count FROM customers WHERE cafe_id = ?',
          [cafeId]
        ) as [RowDataPacket[], unknown];
        const [customersThisMonth] = await pool.execute(
          'SELECT COUNT(*) as count FROM customers WHERE cafe_id = ? AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())',
          [cafeId]
        ) as [RowDataPacket[], unknown];
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
        ) as [RowDataPacket[], unknown];
        const tc = totalCustomers as (RowDataPacket & { count: number })[];
        const cm = customersThisMonth as (RowDataPacket & { count: number })[];
        const rc = returningCustomers as (RowDataPacket & { count: number })[];
        customerMetrics = {
          total: tc[0]?.count ?? 0,
          new_this_month: cm[0]?.count ?? 0,
          returning: rc.length ? (rc[0]?.count ?? 0) : 0
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
      logger.error('Error fetching analytics overview:', error as Error);
      res.status(500).json({ error: 'Failed to fetch analytics overview' });
    }
  });

  // Get analytics trends
  app.get('/api/analytics/trends', auth, requireFeature('analytics'), async (req: Request, res: Response) => {
    try {
      if (!req.user!.cafe_id) {
        return res.status(403).json({ error: 'Access denied. User must belong to a cafe.' });
      }
      if (req.user!.role !== 'admin' && req.user!.role !== 'manager') {
        return res.status(403).json({ error: 'Access denied. Admin or manager privileges required.' });
      }
      const cafeId = req.user!.cafe_id;
      const days = parseInt(String(req.query.days), 10) || 30;

      const [tableExists] = await pool.execute(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'cafe_daily_metrics'
      `) as [RowDataPacket[], unknown];
      if ((tableExists as RowDataPacket[]).length === 0) {
        return res.json({ orders: [], revenue: [] });
      }

      const endDate = new Date().toISOString().split('T')[0];
      const startDateObj = new Date();
      startDateObj.setDate(startDateObj.getDate() - days);
      const startDate = startDateObj.toISOString().split('T')[0];
      const dailyMetrics = await CafeDailyMetrics.getDateRange(cafeId, startDate, endDate);

      const orders = dailyMetrics.map((m) => ({ date: m.date, count: m.total_orders }));
      const revenue = dailyMetrics.map((m) => ({ date: m.date, amount: m.completed_revenue }));
      res.json({ orders, revenue });
    } catch (error) {
      logger.error('Error fetching analytics trends:', error as Error);
      res.status(500).json({ error: 'Failed to fetch analytics trends' });
    }
  });

  // Get customer analytics
  app.get('/api/analytics/customers', auth, requireFeature('analytics'), async (req: Request, res: Response) => {
    try {
      if (!req.user!.cafe_id) {
        return res.status(403).json({ error: 'Access denied. User must belong to a cafe.' });
      }
      if (req.user!.role !== 'admin' && req.user!.role !== 'manager') {
        return res.status(403).json({ error: 'Access denied. Admin or manager privileges required.' });
      }
      const cafeId = req.user!.cafe_id;

      const [customersColumns] = await pool.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'customers'
        AND COLUMN_NAME = 'cafe_id'
      `) as [RowDataPacket[], unknown];
      if ((customersColumns as RowDataPacket[]).length === 0) {
        return res.json({ total: 0, new_this_month: 0, active: 0, returning: 0 });
      }

      const [totalCustomers] = await pool.execute(
        'SELECT COUNT(*) as count FROM customers WHERE cafe_id = ?',
        [cafeId]
      ) as [RowDataPacket[], unknown];
      const [customersThisMonth] = await pool.execute(
        'SELECT COUNT(*) as count FROM customers WHERE cafe_id = ? AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())',
        [cafeId]
      ) as [RowDataPacket[], unknown];
      const [activeCustomers] = await pool.execute(
        'SELECT COUNT(*) as count FROM customers WHERE cafe_id = ? AND is_active = TRUE',
        [cafeId]
      ) as [RowDataPacket[], unknown];
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
      ) as [RowDataPacket[], unknown];

      const tc = totalCustomers as (RowDataPacket & { count: number })[];
      const cm = customersThisMonth as (RowDataPacket & { count: number })[];
      const ac = activeCustomers as (RowDataPacket & { count: number })[];
      const rc = returningCustomers as (RowDataPacket & { count: number })[];

      res.json({
        total: tc[0]?.count ?? 0,
        new_this_month: cm[0]?.count ?? 0,
        active: ac[0]?.count ?? 0,
        returning: rc.length ? (rc[0]?.count ?? 0) : 0
      });
    } catch (error) {
      logger.error('Error fetching customer analytics:', error as Error);
      res.status(500).json({ error: 'Failed to fetch customer analytics' });
    }
  });

  // Backup endpoint (protected)
  app.post('/api/backup', auth, adminAuth, async (req: Request, res: Response) => {
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
    } catch {
      res.status(501).json({
        success: false,
        error: 'Backup not available',
        details: 'scripts/backup not migrated'
      });
    }
  });
}
