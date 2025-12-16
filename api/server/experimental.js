require('dotenv').config();
const fs = require('fs');
const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..') });
const cluster = require('cluster');
const Redis = require('ioredis');
const cors = require('cors');
const axios = require('axios');
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

const { PORT, HOST, ALLOW_SOCIAL_LOGIN, DISABLE_COMPRESSION, TRUST_PROXY } = process.env ?? {};

/** Allow PORT=0 to be used for automatic free port assignment */
const port = isNaN(Number(PORT)) ? 3080 : Number(PORT);
const host = HOST || 'localhost';
const trusted_proxy = Number(TRUST_PROXY) || 1;

/** Number of worker processes to spawn (simulating multiple pods) */
const workers = Number(process.env.CLUSTER_WORKERS) || 4;

/** Helper to wrap log messages for better visibility */
const wrapLogMessage = (msg) => {
  return `\n${'='.repeat(50)}\n${msg}\n${'='.repeat(50)}`;
};

/**
 * Flushes the Redis cache on startup
 * This ensures a clean state for testing multi-pod MCP connection issues
 */
const flushRedisCache = async () => {
  /** Skip cache flush if Redis is not enabled */
  if (!isEnabled(process.env.USE_REDIS)) {
    logger.info('Redis is not enabled, skipping cache flush');
    return;
  }

  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  };

  if (process.env.REDIS_PASSWORD) {
    redisConfig.password = process.env.REDIS_PASSWORD;
  }

  /** Handle Redis Cluster configuration */
  if (isEnabled(process.env.USE_REDIS_CLUSTER) || process.env.REDIS_URI?.includes(',')) {
    logger.info('Detected Redis Cluster configuration');
    const uris = process.env.REDIS_URI?.split(',').map((uri) => {
      const url = new URL(uri.trim());
      return {
        host: url.hostname,
        port: parseInt(url.port || '6379', 10),
      };
    });
    const redis = new Redis.Cluster(uris, {
      redisOptions: {
        password: process.env.REDIS_PASSWORD,
      },
    });

    try {
      logger.info('Attempting to connect to Redis Cluster...');
      await redis.ping();
      logger.info('Connected to Redis Cluster. Executing flushall...');
      const result = await Promise.race([
        redis.flushall(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Flush timeout')), 10000)),
      ]);
      logger.info('Redis Cluster cache flushed successfully', { result });
    } catch (err) {
      logger.error('Error while flushing Redis Cluster cache:', err);
      throw err;
    } finally {
      redis.disconnect();
    }
    return;
  }

  /** Handle single Redis instance */
  const redis = new Redis(redisConfig);

  try {
    logger.info('Attempting to connect to Redis...');
    await redis.ping();
    logger.info('Connected to Redis. Executing flushall...');
    const result = await Promise.race([
      redis.flushall(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Flush timeout')), 5000)),
    ]);
    logger.info('Redis cache flushed successfully', { result });
  } catch (err) {
    logger.error('Error while flushing Redis cache:', err);
    throw err;
  } finally {
    redis.disconnect();
  }
};

/**
 * Master process
 * Manages worker processes and handles graceful shutdowns
 */
if (cluster.isMaster) {
  logger.info(wrapLogMessage(`Master ${process.pid} is starting...`));
  logger.info(`Spawning ${workers} workers to simulate multi-pod environment`);

  let activeWorkers = 0;
  const startTime = Date.now();

  /** Flush Redis cache before starting workers */
  flushRedisCache()
    .then(() => {
      logger.info('Cache flushed, forking workers...');
      for (let i = 0; i < workers; i++) {
        cluster.fork();
      }
    })
    .catch((err) => {
      logger.error('Unable to flush Redis cache, not forking workers:', err);
      process.exit(1);
    });

  /** Track worker lifecycle */
  cluster.on('online', (worker) => {
    activeWorkers++;
    const uptime = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(
      `Worker ${worker.process.pid} is online (${activeWorkers}/${workers}) after ${uptime}s`,
    );

    /** Notify the last worker to perform one-time initialization tasks */
    if (activeWorkers === workers) {
      const allWorkers = Object.values(cluster.workers);
      const lastWorker = allWorkers[allWorkers.length - 1];
      if (lastWorker) {
        logger.info(wrapLogMessage(`All ${workers} workers are online`));
        lastWorker.send({ type: 'last-worker' });
      }
    }
  });

  cluster.on('exit', (worker, code, signal) => {
    activeWorkers--;
    logger.error(
      `Worker ${worker.process.pid} died (${activeWorkers}/${workers}). Code: ${code}, Signal: ${signal}`,
    );
    logger.info('Starting a new worker to replace it...');
    cluster.fork();
  });

  /** Graceful shutdown on SIGTERM/SIGINT */
  const shutdown = () => {
    logger.info('Master received shutdown signal, terminating workers...');
    for (const id in cluster.workers) {
      cluster.workers[id].kill();
    }
    setTimeout(() => {
      logger.info('Forcing shutdown after timeout');
      process.exit(0);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} else {
  /**
   * Worker process
   * Each worker runs a full Express server instance
   */
  const app = express();

  const startServer = async () => {
    logger.info(`Worker ${process.pid} initializing...`);

    if (typeof Bun !== 'undefined') {
      axios.defaults.headers.common['Accept-Encoding'] = 'gzip';
    }

    /** Connect to MongoDB */
    await connectDb();
    logger.info(`Worker ${process.pid}: Connected to MongoDB`);

    /** Background index sync (non-blocking) */
    indexSync().catch((err) => {
      logger.error(`[Worker ${process.pid}][indexSync] Background sync failed:`, err);
    });

    app.disable('x-powered-by');
    app.set('trust proxy', trusted_proxy);

    /** Seed database (idempotent) */
    await seedDatabase();

    /** Initialize app configuration */
    const appConfig = await getAppConfig();
    initializeFileStorage(appConfig);
    await performStartupChecks(appConfig);
    await updateInterfacePermissions(appConfig);

    /** Load index.html for SPA serving */
    const indexPath = path.join(appConfig.paths.dist, 'index.html');
    let indexHTML = fs.readFileSync(indexPath, 'utf8');

    /** Support serving in subdirectory if DOMAIN_CLIENT is set */
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

    /** Health check endpoint */
    app.get('/health', (_req, res) => res.status(200).send('OK'));

    /** Middleware */
    app.use(noIndex);
    app.use(express.json({ limit: '3mb' }));
    app.use(express.urlencoded({ extended: true, limit: '3mb' }));
    app.use(handleJsonParseError);
    app.use(mongoSanitize());
    app.use(cors());
    app.use(cookieParser());

    if (!isEnabled(DISABLE_COMPRESSION)) {
      app.use(compression());
    } else {
      logger.warn('Response compression has been disabled via DISABLE_COMPRESSION.');
    }

    app.use(staticCache(appConfig.paths.dist));
    app.use(staticCache(appConfig.paths.fonts));
    app.use(staticCache(appConfig.paths.assets));

    if (!ALLOW_SOCIAL_LOGIN) {
      logger.warn('Social logins are disabled. Set ALLOW_SOCIAL_LOGIN=true to enable them.');
    }

    /** OAUTH */
    app.use(passport.initialize());
    passport.use(jwtLogin());
    passport.use(passportLogin());

    /** LDAP Auth */
    if (process.env.LDAP_URL && process.env.LDAP_USER_SEARCH_BASE) {
      passport.use(ldapLogin);
    }

    if (isEnabled(ALLOW_SOCIAL_LOGIN)) {
      await configureSocialLogins(app);
    }

    /** Routes */
    app.use('/oauth', routes.oauth);
    app.use('/api/auth', routes.auth);
    app.use('/api/actions', routes.actions);
    app.use('/api/keys', routes.keys);
    app.use('/api/user', routes.user);
    app.use('/api/search', routes.search);
    app.use('/api/edit', routes.edit);
    app.use('/api/messages', routes.messages);
    app.use('/api/convos', routes.convos);
    app.use('/api/presets', routes.presets);
    app.use('/api/prompts', routes.prompts);
    app.use('/api/categories', routes.categories);
    app.use('/api/endpoints', routes.endpoints);
    app.use('/api/balance', routes.balance);
    app.use('/api/models', routes.models);
    app.use('/api/plugins', routes.plugins);
    app.use('/api/config', routes.config);
    app.use('/api/assistants', routes.assistants);
    app.use('/api/files', await routes.files.initialize());
    app.use('/images/', createValidateImageRequest(appConfig.secureImageLinks), routes.staticRoute);
    app.use('/api/share', routes.share);
    app.use('/api/roles', routes.roles);
    app.use('/api/agents', routes.agents);
    app.use('/api/banner', routes.banner);
    app.use('/api/memories', routes.memories);
    app.use('/api/permissions', routes.accessPermissions);
    app.use('/api/tags', routes.tags);
    app.use('/api/mcp', routes.mcp);

    /** Error handler */
    app.use(ErrorController);

    /** SPA fallback - serve index.html for all unmatched routes */
    app.use((req, res) => {
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

    /** Start listening on shared port (cluster will distribute connections) */
    app.listen(port, host, async () => {
      logger.info(
        `Worker ${process.pid} started: Server listening at http://${
          host == '0.0.0.0' ? 'localhost' : host
        }:${port}`,
      );

      /** Initialize MCP servers and OAuth reconnection for this worker */
      await initializeMCPs();
      await initializeOAuthReconnectManager();
      await checkMigrations();
    });

    /** Handle inter-process messages from master */
    process.on('message', async (msg) => {
      if (msg.type === 'last-worker') {
        logger.info(
          wrapLogMessage(
            `Worker ${process.pid} is the last worker and can perform special initialization tasks`,
          ),
        );
        /** Add any one-time initialization tasks here */
        /** For example: scheduled jobs, cleanup tasks, etc. */
      }
    });
  };

  startServer().catch((err) => {
    logger.error(`Failed to start worker ${process.pid}:`, err);
    process.exit(1);
  });

  /** Export app for testing purposes (only available in worker processes) */
  module.exports = app;
}

/**
 * Uncaught exception handler
 * Filters out known non-critical errors
 */
let messageCount = 0;
process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    logger.error('There was an uncaught error:', err);
  }

  if (err.message && err.message?.toLowerCase()?.includes('abort')) {
    logger.warn('There was an uncatchable abort error.');
    return;
  }

  if (err.message.includes('GoogleGenerativeAI')) {
    logger.warn(
      '\n\n`GoogleGenerativeAI` errors cannot be caught due to an upstream issue, see: https://github.com/google-gemini/generative-ai-js/issues/303',
    );
    return;
  }

  if (err.message.includes('fetch failed')) {
    if (messageCount === 0) {
      logger.warn('Meilisearch error, search will be disabled');
      messageCount++;
    }
    return;
  }

  if (err.message.includes('OpenAIError') || err.message.includes('ChatCompletionMessage')) {
    logger.error(
      '\n\nAn Uncaught `OpenAIError` error may be due to your reverse-proxy setup or stream configuration, or a bug in the `openai` node package.',
    );
    return;
  }

  if (err.stack && err.stack.includes('@librechat/agents')) {
    logger.error(
      '\n\nAn error occurred in the agents system. The error has been logged and the app will continue running.',
      {
        message: err.message,
        stack: err.stack,
      },
    );
    return;
  }

  process.exit(1);
});
