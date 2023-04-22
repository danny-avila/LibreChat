const express = require('express');
const session = require('express-session');
const connectDb = require('../lib/db/connectDb');
const migrateDb = require('../lib/db/migrateDb');
const indexSync = require('../lib/db/indexSync');
const path = require('path');
const cors = require('cors');
const routes = require('./routes');
const errorController = require('./controllers/errorController');
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
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(projectPath, 'dist')));
  app.set('trust proxy', 1); // trust first proxy
  app.use(
    session({
      secret: 'chatgpt-clone-random-secrect',
      resave: false,
      saveUninitialized: true,
      cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
    })
  );

  // Auth
  app.use(passport.initialize());
  require('../strategies/jwtStrategy');
  require('../strategies/facebookStrategy');
  require('../strategies/googleStrategy');
  require('../strategies/localStrategy');

  // ROUTES

  /* chore: potential redirect error here, can only comment out this block; 
    comment back in if using auth routes i guess */
  // app.get('/', routes.authenticatedOrRedirect, function (req, res) {
  //   console.log(path.join(projectPath, 'public', 'index.html'));
  //   res.sendFile(path.join(projectPath, 'public', 'index.html'));
  // });

  // api endpoint
  app.use('/api/search', routes.authenticatedOr401, routes.search);
  app.use('/api/ask', routes.authenticatedOr401, routes.ask);
  app.use('/api/messages', routes.authenticatedOr401, routes.messages);
  app.use('/api/convos', routes.authenticatedOr401, routes.convos);
  app.use('/api/presets', routes.authenticatedOr401, routes.presets);
  app.use('/api/prompts', routes.authenticatedOr401, routes.prompts);
  app.use('/api/tokenizer', routes.authenticatedOr401, routes.tokenizer);
  app.use('/api/endpoints', routes.authenticatedOr401, routes.endpoints);

  // user system
  app.use('/auth', routes.auth);
  app.use('/api/me', routes.me);

  // static files
  app.get('/*', routes.authenticatedOrRedirect, function (req, res) {
    res.sendFile(path.join(projectPath, 'dist', 'index.html'));
  });

  app.listen(port, host, () => {
    if (host == '0.0.0.0')
      console.log(
        `Server listening on all interface at port ${port}. Use http://localhost:${port} to access it`
      );
    else console.log(`Server listening at http://${host == '0.0.0.0' ? 'localhost' : host}:${port}`);
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
