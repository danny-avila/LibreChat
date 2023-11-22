const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..') });
const cors = require('cors');
const express = require('express');
const passport = require('passport');
const mongoSanitize = require('express-mongo-sanitize');
const errorController = require('./controllers/ErrorController');
const configureSocialLogins = require('./socialLogins');
const { connectDb, indexSync } = require('../lib/db');
const config = require('../config');
const routes = require('./routes');

const { PORT, HOST, ALLOW_SOCIAL_LOGIN } = process.env ?? {};

const port = Number(PORT) || 3080;
const host = HOST || 'localhost';
const projectPath = path.join(__dirname, '..', '..', 'client');
const { jwtLogin, passportLogin } = require('../strategies');

const startServer = async () => {
  await connectDb();
  console.log('Connected to MongoDB');
  await indexSync();

  const app = express();
  app.locals.config = config;

  // Middleware
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

  // Static files
  app.get('/*', function (req, res) {
    res.sendFile(path.join(projectPath, 'dist', 'index.html'));
  });

  app.listen(port, host, () => {
    if (host == '0.0.0.0') {
      console.log(
        `Server listening on all interfaces at port ${port}. Use http://localhost:${port} to access it`,
      );
    } else {
      console.log(`Server listening at http://${host == '0.0.0.0' ? 'localhost' : host}:${port}`);
    }
  });
};

startServer();

let messageCount = 0;
process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
  }

  if (err.message.includes('fetch failed')) {
    if (messageCount === 0) {
      console.error('Meilisearch error, search will be disabled');
      messageCount++;
    }
  } else {
    process.exit(1);
  }
});
