const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..') });
const cors = require('cors');
const express = require('express');
const passport = require('passport');
const mongoSanitize = require('express-mongo-sanitize');
const { initializeFirebase } = require('~/server/services/Files/Firebase/initialize');
const loadCustomConfig = require('~/server/services/Config/loadCustomConfig');
const errorController = require('~/server/controllers/ErrorController');
const configureSocialLogins = require('~/server/socialLogins');
const noIndex = require('~/server/middleware/noIndex');
const { connectDb, indexSync } = require('~/lib/db');
const { logger } = require('~/config');

const routes = require('~/server/routes');
const paths = require('~/config/paths');

const { PORT, HOST, ALLOW_SOCIAL_LOGIN } = process.env ?? {};

const port = Number(PORT) || 3080;
const host = HOST || 'localhost';
const projectPath = path.join(__dirname, '..', '..', 'client');
const { jwtLogin, passportLogin } = require('~/strategies');

const startServer = async () => {
  await connectDb();
  logger.info('Connected to MongoDB');
  await loadCustomConfig();
  initializeFirebase();
  await indexSync();

  const app = express();
  app.locals.config = paths;

  // Middleware
  app.use(noIndex);
  app.use(errorController);
  app.use(express.json({ limit: '3mb' }));
  app.use(mongoSanitize());
  app.use(express.urlencoded({ extended: true, limit: '3mb' }));
  app.use(express.static(path.join(projectPath, 'dist')));
  app.use(express.static(path.join(projectPath, 'public')));
  app.set('trust proxy', 1); // trust first proxy
  app.use(cors());

  if (!ALLOW_SOCIAL_LOGIN) {
    console.warn(
      'Social logins are disabled. Set Envrionment Variable "ALLOW_SOCIAL_LOGIN" to true to enable them.',
    );
  }

  // OAUTH
  app.use(passport.initialize());
  passport.use(await jwtLogin());
  passport.use(passportLogin());

  if (ALLOW_SOCIAL_LOGIN?.toLowerCase() === 'true') {
    configureSocialLogins(app);
  }

  app.use('/oauth', routes.oauth);
  // API Endpoints
  app.use('/api/auth', routes.auth);
  app.use('/api/keys', routes.keys);
  app.use('/api/user', routes.user);
  app.use('/api/search', routes.search);
  app.use('/api/ask', routes.ask);
  app.use('/api/edit', routes.edit);
  app.use('/api/messages', routes.messages);
  app.use('/api/convos', routes.convos);
  app.use('/api/presets', routes.presets);
  app.use('/api/prompts', routes.prompts);
  app.use('/api/tokenizer', routes.tokenizer);
  app.use('/api/endpoints', routes.endpoints);
  app.use('/api/balance', routes.balance);
  app.use('/api/models', routes.models);
  app.use('/api/plugins', routes.plugins);
  app.use('/api/config', routes.config);
  app.use('/api/assistants', routes.assistants);
  app.use('/api/files', routes.files);

  app.use((req, res) => {
    res.status(404).sendFile(path.join(projectPath, 'dist', 'index.html'));
  });

  app.listen(port, host, () => {
    if (host == '0.0.0.0') {
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
