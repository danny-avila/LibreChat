require('dotenv').config();
const fs = require('fs');
const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..') });
const cors = require('cors');
const axios = require('axios');
const express = require('express');
const passport = require('passport');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { logger } = require('@librechat/data-schemas');
const mongoSanitize = require('express-mongo-sanitize');

let apiUtils = {};
try {
  apiUtils = require('@librechat/api');
} catch (e) {
  console.warn('[Warning] Failed to load @librechat/api:', e.message);
}

const {
  isEnabled,
  ErrorController,
  performStartupChecks,
  handleJsonParseError,
  initializeFileStorage,
} = apiUtils;

const { connectDb, indexSync } = require('~/db');
const initializeOAuthReconnectManager = require('./services/initializeOAuthReconnectManager');
const createValidateImageRequest = require('./middleware/validateImageRequest');
const { jwtLogin, ldapLogin, passportLogin } = require('~/strategies');
const { updateInterfacePermissions } = require('~/models/interface');
const { checkMigrations } = require('./services/start/migration');
const initializeMCPs = require('./services/initializeMCPs');
const configureSocialLogins = require('./socialLogins');
const { getAppConfig } = require('./services/Config');
const staticCache = require('./utils/staticCache');
const noIndex = require('./middleware/noIndex');
const { seedDatabase } = require('~/models');
const routes = require('./routes');

// --- N8N SAFE IMPORT ---
let n8nRoutes, n8nProxy, librechatIntegrationRoutes;
try {
  n8nRoutes = require('./routes/n8n');
  n8nProxy = require('./middleware/n8nProxy');
  librechatIntegrationRoutes = require('./routes/librechat-integration');
} catch (error) {
  console.warn('[Warning] N8n integration files not found:', error.message);
}

const { PORT, HOST, ALLOW_SOCIAL_LOGIN, DISABLE_COMPRESSION, TRUST_PROXY } = process.env ?? {};

const port = isNaN(Number(PORT)) ? 3080 : Number(PORT);
const host = HOST || 'localhost';
const trusted_proxy = Number(TRUST_PROXY) || 1;

const app = express();

const safeUse = (appInstance, middleware, name) => {
  try {
    if (middleware && typeof middleware === 'function') {
      appInstance.use(middleware);
      console.log(`[OK] Middleware loaded: ${name}`);
    } else {
      console.warn(`[SKIP] Middleware '${name}' is invalid/undefined. Skipped.`);
    }
  } catch (err) {
    console.error(`[ERROR] Failed to load middleware '${name}':`, err.message);
  }
};

const startServer = async () => {
  if (typeof Bun !== 'undefined') {
    axios.defaults.headers.common['Accept-Encoding'] = 'gzip';
  }
  await connectDb();

  logger.info('Connected to MongoDB');
  indexSync().catch((err) => {
    logger.error('[indexSync] Background sync failed:', err);
  });

  app.disable('x-powered-by');
  app.set('trust proxy', trusted_proxy);

  await seedDatabase();
  const appConfig = await getAppConfig();
  if (initializeFileStorage) initializeFileStorage(appConfig);
  if (performStartupChecks) await performStartupChecks(appConfig);
  if (updateInterfacePermissions) await updateInterfacePermissions(appConfig);

  let indexHTML = '';
  try {
    const indexPath = path.join(appConfig.paths.dist, 'index.html');
    indexHTML = fs.readFileSync(indexPath, 'utf8');
    console.log('[server] Frontend assets loaded');
  } catch (error) {
    console.log('[server] Frontend not built, running backend-only mode');
  }

  if (process.env.DOMAIN_CLIENT) {
    const clientUrl = new URL(process.env.DOMAIN_CLIENT);
    const baseHref = clientUrl.pathname.endsWith('/')
      ? clientUrl.pathname
      : `${clientUrl.pathname}/`;
    if (baseHref !== '/') {
      logger.info(`Setting base href to ${baseHref}`);
      indexHTML = indexHTML.replace(/base href="\/"/, `base href="${baseHref}"`);
    }
  }

  app.get('/health', (_req, res) => res.status(200).send('OK'));

  console.log('--- [DEBUG] Checkpoint 1: Base Middleware (SAFE MODE) ---');

  // 1. noIndex
  safeUse(app, noIndex, 'noIndex');

  // 2. Standard Express Middleware
  app.use(express.json({ limit: '3mb' }));
  app.use(express.urlencoded({ extended: true, limit: '3mb' }));

  // 3. handleJsonParseError
  safeUse(app, handleJsonParseError, 'handleJsonParseError');

  // 4. mongoSanitize
  if (typeof mongoSanitize === 'function') {
    safeUse(app, mongoSanitize(), 'mongoSanitize');
  }

  // 5. CORS & CookieParser
  safeUse(app, cors(), 'cors');
  safeUse(app, cookieParser(), 'cookieParser');

  // 6. Compression
  if (!isEnabled(DISABLE_COMPRESSION)) {
    safeUse(app, compression(), 'compression');
  }

  // 7. Static Cache
  if (typeof staticCache === 'function') {
    safeUse(app, staticCache(appConfig.paths.dist), 'staticCache dist');
    safeUse(app, staticCache(appConfig.paths.fonts), 'staticCache fonts');
    safeUse(app, staticCache(appConfig.paths.assets), 'staticCache assets');
  } else {
    console.warn('[SKIP] staticCache is not a function');
  }

  console.log('--- [DEBUG] Checkpoint 2: Auth Setup ---');

  if (!ALLOW_SOCIAL_LOGIN) {
    console.warn('Social logins are disabled.');
  }

  app.use(passport.initialize());
  passport.use(jwtLogin());
  passport.use(passportLogin());

  if (process.env.LDAP_URL && process.env.LDAP_USER_SEARCH_BASE) {
    passport.use(ldapLogin);
  }

  if (isEnabled(ALLOW_SOCIAL_LOGIN)) {
    await configureSocialLogins(app);
  }

  // N8n Tools Middleware - Load n8n workflows as AI function tools
  try {
    const { loadN8nTools } = require('./middleware/loadN8nTools');
    app.use(loadN8nTools);
    console.log('[OK] N8n tools middleware loaded (function calling enabled)');
  } catch (e) {
    console.warn('[SKIP] N8n tools middleware:', e.message);
  }

  // N8n Tools Injection Middleware - Inject tools into endpointOption
  // MUST be AFTER passport init (so req.user exists) but BEFORE routes
  try {
    const injectN8nTools = require('./middleware/injectN8nTools');
    app.use(injectN8nTools); // Apply to ALL requests (not just /api/*)
    console.log('[OK] N8n tools injection middleware loaded (global)');
  } catch (e) {
    console.warn('[SKIP] N8n tools injection middleware:', e.message);
  }

  console.log('--- [DEBUG] Checkpoint 3: Routes (SAFE MODE) ---');

  const safeRoute = (path, handler, name) => {
    if (handler) {
      app.use(path, handler);
      console.log(`[OK] Route loaded: ${name}`);
    } else {
      console.warn(`[SKIP] Route '${name}' is undefined. Skipped.`);
    }
  };

  safeRoute('/oauth', routes.oauth, 'oauth');
  safeRoute('/api/auth', routes.auth, 'auth');
  safeRoute('/api/actions', routes.actions, 'actions');
  safeRoute('/api/keys', routes.keys, 'keys');
  safeRoute('/api/user', routes.user, 'user');
  safeRoute('/api/search', routes.search, 'search');
  safeRoute('/api/edit', routes.edit, 'edit');
  safeRoute('/api/messages', routes.messages, 'messages');
  safeRoute('/api/convos', routes.convos, 'convos');
  safeRoute('/api/presets', routes.presets, 'presets');
  safeRoute('/api/prompts', routes.prompts, 'prompts');
  safeRoute('/api/categories', routes.categories, 'categories');
  safeRoute('/api/endpoints', routes.endpoints, 'endpoints');
  safeRoute('/api/balance', routes.balance, 'balance');
  safeRoute('/api/models', routes.models, 'models');
  safeRoute('/api/plugins', routes.plugins, 'plugins');
  safeRoute('/api/config', routes.config, 'config');
  safeRoute('/api/assistants', routes.assistants, 'assistants');

  // Files Initialization
  if (routes.files && typeof routes.files.initialize === 'function') {
    try {
      app.use('/api/files', await routes.files.initialize());
      console.log('[OK] Route loaded: files');
    } catch (e) {
      console.warn('[SKIP] Failed to init files route');
    }
  }

  safeRoute('/images/', createValidateImageRequest(appConfig.secureImageLinks), 'validateImage');
  safeRoute('/images/', routes.staticRoute, 'staticRoute');
  safeRoute('/api/share', routes.share, 'share');
  safeRoute('/api/roles', routes.roles, 'roles');
  safeRoute('/api/agents', routes.agents, 'agents');
  safeRoute('/api/banner', routes.banner, 'banner');
  safeRoute('/api/memories', routes.memories, 'memories');

  // Optional Routes
  safeRoute('/api/permissions', routes.accessPermissions, 'accessPermissions');
  safeRoute('/api/tags', routes.tags, 'tags');
  safeRoute('/api/mcp', routes.mcp, 'mcp');

  console.log('--- [DEBUG] Checkpoint 4: N8n ---');

  if (n8nRoutes && n8nProxy) {
    app.use((req, res, next) => {
      req.n8nProxy = n8nProxy;
      next();
    });
    app.use('/api/n8n', n8nRoutes);
    console.log('[OK] n8n integration loaded');
  } else {
    console.log('[SKIP] n8n integration (modules missing)');
  }

  // LibreChat Integration Routes (Direct n8n webhook endpoints)
  if (librechatIntegrationRoutes) {
    app.use('/api/librechat', librechatIntegrationRoutes);
    console.log('[OK] LibreChat integration routes loaded');
  } else {
    console.log('[SKIP] LibreChat integration routes (module missing)');
  }

  // N8n Tools Routes (AI Function Calling Integration)
  try {
    const n8nToolsRoutes = require('./routes/n8n-tools');
    app.use('/api/n8n-tools', n8nToolsRoutes);
    console.log('[OK] N8n tools routes loaded (AI function calling)');
  } catch (e) {
    console.warn('[SKIP] N8n tools routes (error loading):', e.message);
  }

  // Profile route
  try {
    const profileRoutes = require('./routes/profile');
    app.use('/api/profile', profileRoutes);
    console.log('[OK] Profile routes loaded');
  } catch (e) {
    console.log('[SKIP] Profile routes (error loading)');
  }

  // Social drafts (n8n HITL – store drafts + resumeUrl for approval)
  try {
    const socialDraftsRoutes = require('./routes/socialDrafts');
    app.use('/api/social-drafts', socialDraftsRoutes);
    console.log('[OK] Social drafts routes loaded');
  } catch (e) {
    console.warn('[SKIP] Social drafts routes (error loading):', e.message);
  }

  // Admin route (CEO-only user management)
  try {
    const adminRoutes = require('./routes/admin');
    app.use('/api/admin', adminRoutes);
    console.log('[OK] Admin routes loaded');
  } catch (e) {
    console.log('[SKIP] Admin routes (error loading)');
    console.error('[ERROR] Admin routes error:', e.message);
    console.error('[ERROR] Stack:', e.stack);
  }

  // Audit Admin routes (CEO-only, feature-gated)
  try {
    const FeatureService = require('./services/FeatureService');

    if (FeatureService.shouldLoadRoutes('audit')) {
      const { requireJwtAuth } = require('./middleware');
      const requireCEORole = require('./middleware/requireCEORole');
      const { requireFeature } = require('./middleware/featureGuard');
      const auditAdminRoutes = require('./routes/auditAdmin');

      app.use(
        '/api/admin/audits',
        requireJwtAuth,
        requireCEORole,
        requireFeature('audit'),
        auditAdminRoutes,
      );

      console.log(`[OK] Audit admin routes loaded for ${FeatureService.getBusinessName()}`);
    } else {
      console.log(
        `[SKIP] Audit admin routes (feature disabled for ${FeatureService.getBusinessName()})`,
      );
    }
  } catch (e) {
    console.log('[SKIP] Audit admin routes (error loading)');
    console.error('[ERROR] Audit admin routes error:', e.message);
  }

  // Signage orders proxy routes (PDF Builder integration)
  // Signage Orders Routes (PDF Builder Integration)
  try {
    const signageOrdersRoutes = require('./routes/signageOrders');
    app.use('/api/signage', signageOrdersRoutes);
    console.log('[OK] Signage orders routes loaded');
  } catch (e) {
    console.log('[SKIP] Signage orders routes (error loading)');
    console.error('[ERROR] Signage orders routes error:', e.message);
  }

  // Social Media Integration Routes (Postiz)
  try {
    const socialRoutes = require('./routes/social');
    app.use('/api/social', socialRoutes);
    console.log('[OK] Social media integration routes loaded');
  } catch (e) {
    console.log('[SKIP] Social media integration routes (error loading)');
    console.error('[ERROR] Social routes error:', e.message);
  }

  // Error Controller
  if (ErrorController) {
    app.use(ErrorController);
  } else {
    app.use((err, req, res, next) => {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    });
  }

  app.use((req, res) => {
    if (!indexHTML) {
      return res.json({
        message: 'LibreChat Backend API',
        status: 'running',
        mode: 'backend-only',
        endpoints: { health: '/health', auth: '/api/auth' },
      });
    }
    res.set({
      'Cache-Control': process.env.INDEX_CACHE_CONTROL || 'no-cache, no-store, must-revalidate',
      Pragma: process.env.INDEX_PRAGMA || 'no-cache',
      Expires: process.env.INDEX_EXPIRES || '0',
    });
    const lang = req.cookies.lang || req.headers['accept-language']?.split(',')[0] || 'en-US';
    const saneLang = lang.replace(/"/g, '&quot;');
    let updatedIndexHtml = indexHTML.replace(/lang="en-US"/g, `lang="${saneLang}"`);
    res.type('html');
    res.send(updatedIndexHtml);
  });

  app.listen(port, host, async () => {
    if (host === '0.0.0.0') {
      logger.info(`Server listening on all interfaces at port ${port}.`);
    } else {
      logger.info(`Server listening at http://${host == '0.0.0.0' ? 'localhost' : host}:${port}`);
    }

    // Log feature configuration
    try {
      const FeatureService = require('./services/FeatureService');
      FeatureService.logStartupConfig();
    } catch (e) {
      logger.warn('[WARN] Failed to log feature configuration:', e.message);
    }

    if (initializeMCPs) await initializeMCPs();
    if (initializeOAuthReconnectManager) await initializeOAuthReconnectManager();
    if (checkMigrations) await checkMigrations();

    console.log('--- [DEBUG] SERVER STARTED SUCCESSFULLY ---');
  });
};

startServer();

let messageCount = 0;
process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    logger.error('There was an uncaught error:', err);
  }
  if (err.message && err.message?.toLowerCase()?.includes('abort')) {
    return;
  }
  if (err.message.includes('GoogleGenerativeAI')) {
    return;
  }
  if (err.message.includes('fetch failed')) {
    if (messageCount === 0) {
      logger.warn('Meilisearch error, search will be disabled');
      messageCount++;
    }
    return;
  }
  console.error('[CRITICAL] Uncaught Exception:', err.message);
  // process.exit(1);
});

module.exports = app;
