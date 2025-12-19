require('dotenv').config();
const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..') });
const express = require('express');
const passport = require('passport');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { logger } = require('@librechat/data-schemas');
const mongoSanitize = require('express-mongo-sanitize');
const {
  isEnabled,
  ErrorController,
  performStartupChecks,
  handleJsonParseError,
  initializeFileStorage,
} = require('@librechat/api');
const { connectDb, indexSync } = require('~/db');
const createValidateImageRequest = require('./middleware/validateImageRequest');
const { jwtLogin, ldapLogin, passportLogin } = require('~/strategies');
const { updateInterfacePermissions } = require('~/models/interface');
const { getAppConfig } = require('./services/Config');
const { seedDatabase } = require('~/models');
const routes = require('./routes');

/**
 * Lightweight app initializer for serverless environments (Vercel)
 * Performs lazy initialization and returns an Express app instance
 */
async function createApp() {
  const app = express();

  // Connect to DB (cached in module) and start background jobs non-blocking
  await connectDb();
  indexSync().catch((err) => logger.error('[indexSync] Background sync failed:', err));

  app.disable('x-powered-by');
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

  try {
    await seedDatabase();
  } catch (err) {
    logger.warn('[seedDatabase] Seed failed, continuing startup:', err?.message || err);
  }

  const appConfig = await getAppConfig();
  try {
    initializeFileStorage(appConfig);
    await performStartupChecks(appConfig);
    await updateInterfacePermissions(appConfig);
  } catch (err) {
    logger.warn('App configuration initialization warning:', err?.message || err);
  }

  app.get('/health', (_req, res) => res.status(200).send('OK'));

  /* Middleware */
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'query', {
      ...Object.getOwnPropertyDescriptor(req, 'query'),
      value: req.query,
      writable: true,
    });
    next();
  });

  app.use(mongoSanitize());
  app.use(express.json({ limit: '3mb' }));
  app.use(express.urlencoded({ extended: true, limit: '3mb' }));
  app.use(handleJsonParseError);
  app.use(cookieParser());

  if (!isEnabled(process.env.DISABLE_COMPRESSION)) {
    app.use(compression());
  }

  app.use(passport.initialize());
  passport.use(jwtLogin());
  passport.use(passportLogin());

  if (process.env.LDAP_URL && process.env.LDAP_USER_SEARCH_BASE) {
    passport.use(ldapLogin);
  }

  // Mount routes (files route needs async initialize)
  app.use('/oauth', routes.oauth);
  app.use('/api/auth', routes.auth);
  app.use('/api/actions', routes.actions);
  app.use('/api/keys', routes.keys);
  app.use('/api/user', routes.user);
  app.use('/api/search', routes.search);
  app.use('/api/messages', routes.messages);
  app.use('/api/convos', routes.convos);
  app.use('/api/presets', routes.presets);
  app.use('/api/prompts', routes.prompts);
  app.use('/api/categories', routes.categories);
  app.use('/api/endpoints', routes.endpoints);
  app.use('/api/balance', routes.balance);
  app.use('/api/models', routes.models);
  app.use('/api/config', routes.config);
  app.use('/api/assistants', routes.assistants);

  // files.initialize() may be async
  try {
    app.use('/api/files', await routes.files.initialize());
  } catch (err) {
    logger.warn('Unable to initialize files route:', err?.message || err);
  }

  app.use('/images/', createValidateImageRequest(appConfig.secureImageLinks), routes.staticRoute);
  app.use('/api/share', routes.share);
  app.use('/api/roles', routes.roles);
  app.use('/api/agents', routes.agents);
  app.use('/api/banner', routes.banner);
  app.use('/api/memories', routes.memories);
  app.use('/api/permissions', routes.accessPermissions);
  app.use('/api/tags', routes.tags);
  app.use('/api/mcp', routes.mcp);

  app.use(ErrorController);

  return app;
}

module.exports = { createApp };
