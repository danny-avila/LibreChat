const express = require('express');
const connectDb = require('../lib/db/connectDb');
const migrateDb = require('../lib/db/migrateDb');
const indexSync = require('../lib/db/indexSync');
const path = require('path');
const cors = require('cors');
const routes = require('./routes');
const errorController = require('./controllers/error.controller');
const passport = require('passport');

const port = process.env.PORT || 3080;
const host = process.env.HOST || 'localhost';
const projectPath = path.join(__dirname, '..', '..', 'client');

(async () => {
  await connectDb();
  console.log('Connected to MongoDB');
  await migrateDb();
  await indexSync();

  const app = express();
  app.use(errorController);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(projectPath, 'dist')));
  app.set('trust proxy', 1); // trust first proxy
  app.use(cors());

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
  app.use('/oauth', routes.oauth);
  // api endpoint
  app.use('/api/auth', routes.auth);
  app.use('/api/search', routes.search);
  app.use('/api/ask', routes.ask);
  app.use('/api/messages', routes.messages);
  app.use('/api/convos', routes.convos);
  app.use('/api/presets', routes.presets);
  app.use('/api/prompts', routes.prompts);
  app.use('/api/tokenizer', routes.tokenizer);
  app.use('/api/endpoints', routes.endpoints);
  app.use('/api/stripe', routes.stripe);

  // static files
  app.get('/*', function (req, res) {
    res.sendFile(path.join(projectPath, 'dist', 'index.html'));
  });

  app.listen(port, host, () => {
    if (host == '0.0.0.0')
      console.log(
        `Server listening on all interface at port ${port}. Use http://localhost:${port} to access it`
      );
    else
      console.log(`Server listening at http://${host == '0.0.0.0' ? 'localhost' : host}:${port}`);
  });
})();

let messageCount = 0;
process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:', err.message);
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
