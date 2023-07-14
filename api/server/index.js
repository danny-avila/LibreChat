const express = require('express');
const session = require('express-session');
const connectDb = require('../lib/db/connectDb');
const migrateDb = require('../lib/db/migrateDb');
const indexSync = require('../lib/db/indexSync');
const path = require('path');
const cors = require('cors');
const routes = require('./routes');
const errorController = require('./controllers/ErrorController');
const passport = require('passport');
const port = process.env.PORT || 3080;
const host = process.env.HOST || 'localhost';
const projectPath = path.join(__dirname, '..', '..', 'client');

// Init the config and validate it
const config = require('../../config/loader');
config.validate(); // Validate the config

(async () => {
  await connectDb();
  console.log('Connected to MongoDB');
  await migrateDb();
  await indexSync();

  const app = express();
  app.use(errorController);
  app.use(express.json({ limit: '3mb' }));
  app.use(express.urlencoded({ extended: true, limit: '3mb' }));
  app.use(express.static(path.join(projectPath, 'dist')));
  app.use(express.static(path.join(projectPath, 'public')));

  app.set('trust proxy', 1); // trust first proxy
  app.use(cors());

  if (!process.env.ALLOW_SOCIAL_LOGIN) {
    console.warn(
      'Social logins are disabled. Set Envrionment Variable "ALLOW_SOCIAL_LOGIN" to true to enable them.',
    );
  }

  // OAUTH
  app.use(passport.initialize());
  require('../strategies/jwtStrategy');
  require('../strategies/localStrategy');
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    require('../strategies/googleStrategy');
  }
  if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
    require('../strategies/facebookStrategy');
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    require('../strategies/githubStrategy');
  }
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    require('../strategies/discordStrategy');
  }
  if (
    process.env.OPENID_CLIENT_ID &&
    process.env.OPENID_CLIENT_SECRET &&
    process.env.OPENID_ISSUER &&
    process.env.OPENID_SCOPE &&
    process.env.OPENID_SESSION_SECRET
  ) {
    app.use(
      session({
        secret: process.env.OPENID_SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
      }),
    );
    app.use(passport.session());
    require('../strategies/openidStrategy');
  }
  app.use('/oauth', routes.oauth);
  // api endpoint
  app.use('/api/auth', routes.auth);
  app.use('/api/user', routes.user);
  app.use('/api/search', routes.search);
  app.use('/api/ask', routes.ask);
  app.use('/api/messages', routes.messages);
  app.use('/api/convos', routes.convos);
  app.use('/api/presets', routes.presets);
  app.use('/api/prompts', routes.prompts);
  app.use('/api/tokenizer', routes.tokenizer);
  app.use('/api/endpoints', routes.endpoints);
  app.use('/api/plugins', routes.plugins);
  app.use('/api/config', routes.config);

  // static files
  app.get('/*', function (req, res) {
    res.sendFile(path.join(projectPath, 'dist', 'index.html'));
  });

  app.listen(port, host, () => {
    if (host == '0.0.0.0') {
      console.log(
        `Server listening on all interface at port ${port}. Use http://localhost:${port} to access it`,
      );
    } else {
      console.log(`Server listening at http://${host == '0.0.0.0' ? 'localhost' : host}:${port}`);
    }
  });
})();

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
