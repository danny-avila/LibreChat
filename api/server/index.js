require('dotenv').config();
const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..') });
// const Redis = require('ioredis');
const cors = require('cors');
const axios = require('axios');
const express = require('express');
const session = require('express-session');
const compression = require('compression');
const passport = require('passport');
const mongoSanitize = require('express-mongo-sanitize');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { jwtLogin, passportLogin, webauthnStrategy } = require('~/strategies');
const { connectDb, indexSync } = require('~/lib/db');
const { isEnabled } = require('~/server/utils');
const { ldapLogin } = require('~/strategies');
const { logger } = require('~/config');
const validateImageRequest = require('./middleware/validateImageRequest');
const errorController = require('./controllers/ErrorController');
const configureSocialLogins = require('./socialLogins');
const AppService = require('./services/AppService');
const staticCache = require('./utils/staticCache');
const noIndex = require('./middleware/noIndex');
const routes = require('./routes');
const { User } = require('~/models');
// const MongoStore = require('connect-mongo');

const { PORT, HOST, ALLOW_SOCIAL_LOGIN, DISABLE_COMPRESSION } = process.env ?? {};

const port = Number(PORT) || 3080;
const host = HOST || 'localhost';

const startServer = async () => {
  if (typeof Bun !== 'undefined') {
    axios.defaults.headers.common['Accept-Encoding'] = 'gzip';
  }
  await connectDb();
  logger.info('Connected to MongoDB');
  await indexSync();

  const app = express();
  app.disable('x-powered-by');
  await AppService(app);

  const indexPath = path.join(app.locals.paths.dist, 'index.html');
  const indexHTML = fs.readFileSync(indexPath, 'utf8');

  app.get('/health', (_req, res) => res.status(200).send('OK'));

  /* Middleware */
  app.use(noIndex);
  app.use(errorController);
  app.use(express.json({ limit: '3mb' }));
  app.use(mongoSanitize());
  app.use(express.urlencoded({ extended: true, limit: '3mb' }));
  app.use(staticCache(app.locals.paths.dist));
  app.use(staticCache(app.locals.paths.fonts));
  app.use(staticCache(app.locals.paths.assets));
  app.set('trust proxy', 1); /* trust first proxy */

  app.use(
    cors({
      origin: process.env.DOMAIN_CLIENT, // e.g., 'https://your-client-domain.com'
      methods: ['GET', 'POST'],
      credentials: true, // Allow cookies to be sent
    }),
  );
  app.use(cookieParser());

  if (!isEnabled(DISABLE_COMPRESSION)) {
    app.use(compression());
  }

  if (!ALLOW_SOCIAL_LOGIN) {
    console.warn(
      'Social logins are disabled. Set Environment Variable "ALLOW_SOCIAL_LOGIN" to true to enable them.',
    );
  }

  /* Session Management */
  if (
    (process.env.OPENID_CLIENT_ID &&
          process.env.OPENID_CLIENT_SECRET &&
          process.env.OPENID_ISSUER &&
          process.env.OPENID_SCOPE &&
          process.env.OPENID_SESSION_SECRET) || process.env.PASSKEY_ENABLED
  ) {
    app.use(
      session({
        secret: 'your_secret_key', // Replace with a strong secret key
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false }, // Use `true` in production with HTTPS
      }),
    );

    // const sessionOptions = {
    //   secret: process.env.OPENID_SESSION_SECRET || 'your-very-secure-secret',
    //   resave: false,
    //   saveUninitialized: false,
    //   store: MongoStore.create({
    //     mongoUrl: process.env.MONGO_URI, // MongoDB connection string
    //   }),
    //   cookie: {
    //     secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    //     httpOnly: true,
    //     sameSite: 'lax', // Adjust based on your needs
    //   },
    // };

    // if (isEnabled(process.env.USE_REDIS)) {
    //   const client = new Redis(process.env.REDIS_URI);
    //   client
    //     .on('error', (err) => logger.error('ioredis error:', err))
    //     .on('ready', () => logger.info('ioredis successfully initialized.'))
    //     .on('reconnecting', () => logger.info('ioredis reconnecting...'));
    //   sessionOptions.store = new RedisStore({ client, prefix: 'librechat' });
    // } else {
    //   sessionOptions.store = new MemoryStore({
    //     checkPeriod: 86400000, // prune expired entries every 24h
    //   });
    // }

    app.use(passport.initialize());
    app.use(passport.session());
  } else {
    app.use(passport.initialize());
  }

  passport.use(await jwtLogin());
  passport.use(passportLogin());

  /* LDAP Auth */
  if (process.env.LDAP_URL && process.env.LDAP_USER_SEARCH_BASE) {
    passport.use(ldapLogin);
  }
  /* Passkey (WebAuthn) Strategy */
  if (process.env.PASSKEY_ENABLED) {

    // Passport Serialization
    passport.serializeUser(function(user, done) {
      done(null, user.id);
    });

    passport.deserializeUser(async function(id, done) {
      try {
        const user = await User.findById(id).exec();
        done(null, user);
      } catch (err) {
        done(err);
      }
    });

    passport.use(webauthnStrategy);
  }

  if (isEnabled(ALLOW_SOCIAL_LOGIN)) {
    configureSocialLogins();
  }

  app.use('/oauth', routes.oauth);
  /* API Endpoints */
  app.use('/api/auth', routes.auth);
  app.use('/api/auth/passkey', routes.passkeyAuthRoutes);
  app.use('/api/keys', routes.keys);
  app.use('/api/user', routes.user);
  app.use('/api/search', routes.search);
  app.use('/api/ask', routes.ask);
  app.use('/api/edit', routes.edit);
  app.use('/api/messages', routes.messages);
  app.use('/api/convos', routes.convos);
  app.use('/api/presets', routes.presets);
  app.use('/api/prompts', routes.prompts);
  app.use('/api/categories', routes.categories);
  app.use('/api/tokenizer', routes.tokenizer);
  app.use('/api/endpoints', routes.endpoints);
  app.use('/api/balance', routes.balance);
  app.use('/api/models', routes.models);
  app.use('/api/plugins', routes.plugins);
  app.use('/api/config', routes.config);
  app.use('/api/assistants', routes.assistants);
  app.use('/api/files', await routes.files.initialize());
  app.use('/images/', validateImageRequest, routes.staticRoute);
  app.use('/api/share', routes.share);
  app.use('/api/roles', routes.roles);
  app.use('/api/agents', routes.agents);
  app.use('/api/banner', routes.banner);
  app.use('/api/bedrock', routes.bedrock);

  app.use('/api/tags', routes.tags);

  app.use((req, res) => {
    res.set({
      'Cache-Control': process.env.INDEX_CACHE_CONTROL || 'no-cache, no-store, must-revalidate',
      Pragma: process.env.INDEX_PRAGMA || 'no-cache',
      Expires: process.env.INDEX_EXPIRES || '0',
    });

    const lang = req.cookies.lang || req.headers['accept-language']?.split(',')[0] || 'en-US';
    const saneLang = lang.replace(/"/g, '&quot;');
    const updatedIndexHtml = indexHTML.replace(/lang="en-US"/g, `lang="${saneLang}"`);
    res.type('html');
    res.send(updatedIndexHtml);
  });

  app.listen(port, host, () => {
    if (host === '0.0.0.0') {
      logger.info(
        `Server listening on all interfaces at port ${port}. Use http://localhost:${port} to access it`,
      );
    } else {
      logger.info(`Server listening at http://${host == '0.0.0.0' ? 'localhost' : host}:${port}`);
    }
  });
};

startServer();

let messageCount = 0;
process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    logger.error('There was an uncaught error:', err);
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

  process.exit(1);
});