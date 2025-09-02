import express, { Router, Request, Response, NextFunction } from 'express';
import { getOverrides, updateOverride } from '../services/configService';
import path from 'path';
import { resolveFromRoot } from '../utils/paths';
import fs from 'fs';

/**
 * Factory to build an Express router for the GovGPT admin plugin.
 * The JWT-based authentication middleware from LibreChat core **must** be
 * provided by the caller (see packages/custom/mount.js).
 */
export function buildAdminRouter(
  requireJwtAuth: (req: Request, res: Response, next: NextFunction) => void,
): Router {
  const router = express.Router();

  // Importing enums/constants that are safe to resolve directly
  const { SystemRoles } = require('librechat-data-provider');

  const protectedPaths = ['/health', '/config*', '/users*'];

  router.use(protectedPaths, (req: any, res: any, next: any) => {
    requireJwtAuth(req, res, (err?: any) => {
      if (err) {
        return next(err);
      }
      next();
    });
  });

  // Custom admin check middleware (only for protected API endpoints)
  router.use(protectedPaths, (req: any, res: any, next: any) => {
    try {
      if (!req.user) {
        const isHtmlRequest = req.headers.accept && req.headers.accept.includes('text/html');
        
        if (isHtmlRequest) {
          return res.redirect('/login');
        } else {
          return res.status(401).json({ message: 'Authentication required' });
        }
      }
      
      if (req.user.role !== SystemRoles.ADMIN) {
        const isHtmlRequest = req.headers.accept && req.headers.accept.includes('text/html');
        
        if (isHtmlRequest) {
          return res.redirect('/login');
        } else {
          return res.status(403).json({ message: 'Forbidden' });
        }
      }
      
      next();
    } catch (error) {
      const isHtmlRequest = req.headers.accept && req.headers.accept.includes('text/html');
      
      if (isHtmlRequest) {
        return res.redirect('/login');
      } else {
        res.status(500).json({ message: 'Internal Server Error' });
      }
    }
  });

  router.get('/health', (_req, res) => {
    res.json({ plugin: 'govgpt-admin', status: 'ok' });
  });

  router.get('/config', async (req, res) => {
    try {
      const overrides = await getOverrides();
      res.json({ overrides });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Apply multiple overrides then restart
  router.post('/config', async (req, res) => {
    try {
      const { overrides } = req.body as { overrides: Record<string, unknown> };
      if (!overrides || typeof overrides !== 'object') {
        return res.status(400).json({ message: 'overrides object required' });
      }

      const userId = req.user?.id;
      const { updateOverride } = require('../services/configService');

      /* ------------------------------------------------------------------ */
      /* Flatten nested objects so the configService can validate using the */
      /* dot.notation allow-list (e.g. "interface.customWelcome").         */
      /* ------------------------------------------------------------------ */
      const flatten = (obj: Record<string, any>, prefix = ''): Record<string, unknown> => {
        return Object.keys(obj).reduce((acc: Record<string, unknown>, key) => {
          const path = prefix ? `${prefix}.${key}` : key;
          const val = obj[key];

          if (val && typeof val === 'object' && !Array.isArray(val)) {
            Object.assign(acc, flatten(val, path));
          } else {
            acc[path] = val;
          }
          return acc;
        }, {});
      };

      const flatOverrides = flatten(overrides as Record<string, any>);

      for (const [key, value] of Object.entries(flatOverrides)) {
        await updateOverride(key, value, userId);
      }

      res.status(200).json({ message: 'Applied changes, restarting...' });

      // Quit process after short delay so writes flush
      setTimeout(() => process.exit(0), 100);
    } catch (err: any) {
      console.error('[admin/config] apply error', err);
      res.status(500).json({ message: (err as Error).message });
    }
  });
  

  // ---------- User Management Endpoints ----------
  const {
    listUsers,
    getUser,
    createUser: createUserSvc,
    updateUserById,
    deleteUserCompletely,
    getUserBalance,
    updateUserBalance,
    getUserStats,
  } = require('../services/userService');

  // List users with pagination / search
  router.get('/users', async (req, res) => {
    try {
      const { page = '1', limit = '20', search = '' } = req.query as Record<string, string>;
      const result = await listUsers({
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        search,
      });
      res.json(result);
    } catch (err: any) {
      console.error('[admin/users] list error', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Create user
  router.post('/users', async (req, res) => {
    try {
      const user = await createUserSvc(req.body);
      res.status(201).json(user);
    } catch (err: any) {
      console.error('[admin/users] create error', err);
      res.status(400).json({ message: err.message });
    }
  });

  // User statistics for dashboard cards (place BEFORE /users/:id)
  router.get('/users/stats', async (_req, res) => {
    try {
      const stats = await getUserStats();
      res.json(stats);
    } catch (err: any) {
      console.error('[admin/users] stats error', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Get user detail
  router.get('/users/:id', async (req, res) => {
    try {
      const user = await getUser(req.params.id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      res.json(user);
    } catch (err: any) {
      console.error('[admin/users] get error', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Update user
  router.put('/users/:id', async (req, res) => {
    try {
      const updated = await updateUserById(req.params.id, req.body);
      res.json(updated);
    } catch (err: any) {
      console.error('[admin/users] update error', err);
      res.status(400).json({ message: err.message });
    }
  });

  // Delete user
  router.delete('/users/:id', async (req, res) => {
    try {
      await deleteUserCompletely(req.params.id);
      res.status(204).send();
    } catch (err: any) {
      console.error('[admin/users] delete error', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Balance endpoints
  router.get('/users/:id/balance', async (req, res) => {
    try {
      const balance = await getUserBalance(req.params.id);
      // If no balance record exists, respond with default zero credits instead of 404
      if (!balance) return res.json({ tokenCredits: 0 });
      res.json(balance);
    } catch (err: any) {
      console.error('[admin/users] balance get error', err);
      res.status(500).json({ message: err.message });
    }
  });

  router.put('/users/:id/balance', async (req, res) => {
    try {
      const balance = await updateUserBalance(req.params.id, req.body);
      res.json(balance);
    } catch (err: any) {
      console.error('[admin/users] balance update error', err);
      res.status(400).json({ message: err.message });
    }
  });

  // Compute dist path relative to project root
  const distPath = resolveFromRoot('admin-frontend', 'dist');

  console.log('Admin frontend dist path:', distPath);

  // Serve React index for the base paths before static middleware
  router.get(['', '/'], (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  if (fs.existsSync(distPath)) {
    // Serve static assets (these will be protected by the middleware above)
    router.use('/', express.static(distPath));

    // Handle HTML requests - if we reach here, authentication passed
    router.get('*', (req, res, next) => {
      const isHtmlRequest = req.headers.accept && req.headers.accept.includes('text/html');
      if (isHtmlRequest) {
        res.sendFile(path.join(distPath, 'index.html'));
      } else {
        next();
      }
    });
  } else {
    console.warn('WARNING: Admin frontend dist folder not found!');
  }

  return router;
}