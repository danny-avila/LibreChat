const passport = require('passport');
const session = require('express-session');
const { CacheKeys } = require('librechat-data-provider');
const { math, isEnabled, shouldUseSecureCookie } = require('@librechat/api');
const { logger, DEFAULT_SESSION_EXPIRY } = require('@librechat/data-schemas');
const {
  openIdJwtLogin,
  facebookLogin,
  facebookAdminLogin,
  discordLogin,
  discordAdminLogin,
  setupOpenId,
  googleLogin,
  googleAdminLogin,
  githubLogin,
  githubAdminLogin,
  appleLogin,
  appleAdminLogin,
  setupSaml,
} = require('~/strategies');
const { getLogStores } = require('~/cache');

const DEFAULT_OPENID_REUSE_MAX_SESSION_AGE_MS = 15 * 60 * 1000;
const DEFAULT_OPENID_DISCOVERY_RETRY_ATTEMPTS = 3;
const DEFAULT_OPENID_DISCOVERY_RETRY_DELAY_MS = 5000;

let openIdRetryTimeout;

const getSessionExpiry = () => math(process.env.SESSION_EXPIRY, DEFAULT_SESSION_EXPIRY);

const getOpenIdSessionExpiry = () => {
  const sessionExpiry = getSessionExpiry();
  if (!isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    return sessionExpiry;
  }

  const reuseMaxSessionAge = math(
    process.env.OPENID_REUSE_MAX_SESSION_AGE_MS,
    DEFAULT_OPENID_REUSE_MAX_SESSION_AGE_MS,
  );
  return Math.max(sessionExpiry, reuseMaxSessionAge);
};

const getOpenIdRetryAttempts = () => {
  const attempts = math(
    process.env.OPENID_DISCOVERY_RETRY_ATTEMPTS,
    DEFAULT_OPENID_DISCOVERY_RETRY_ATTEMPTS,
  );
  return Number.isFinite(attempts) && attempts > 0
    ? Math.trunc(attempts)
    : DEFAULT_OPENID_DISCOVERY_RETRY_ATTEMPTS;
};

const getOpenIdRetryDelay = () => {
  const delay = math(
    process.env.OPENID_DISCOVERY_RETRY_DELAY_MS,
    DEFAULT_OPENID_DISCOVERY_RETRY_DELAY_MS,
  );
  return Number.isFinite(delay) && delay > 0 ? delay : DEFAULT_OPENID_DISCOVERY_RETRY_DELAY_MS;
};

const wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

async function registerOpenIdStrategies() {
  const config = await setupOpenId();
  if (!config) {
    return false;
  }

  if (isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    logger.info('OpenID token reuse is enabled.');
    passport.use('openidJwt', openIdJwtLogin(config));
  }
  logger.info('OpenID Connect configured successfully.');
  return true;
}

function scheduleOpenIdRetry() {
  if (openIdRetryTimeout) {
    return;
  }

  const retryDelay = getOpenIdRetryDelay();
  logger.warn(`OpenID Connect configuration is unavailable. Retrying in ${retryDelay}ms.`);
  openIdRetryTimeout = setTimeout(async () => {
    openIdRetryTimeout = undefined;
    if (!(await registerOpenIdStrategies())) {
      scheduleOpenIdRetry();
    }
  }, retryDelay);
  openIdRetryTimeout.unref?.();
}

/**
 * Configures OpenID Connect for the application.
 * @param {Express.Application} app - The Express application instance.
 * @returns {Promise<void>}
 */
async function configureOpenId(app) {
  logger.info('Configuring OpenID Connect...');
  const sessionExpiry = getOpenIdSessionExpiry();
  const sessionOptions = {
    secret: process.env.OPENID_SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: getLogStores(CacheKeys.OPENID_SESSION),
    cookie: {
      maxAge: sessionExpiry,
      secure: shouldUseSecureCookie(),
    },
  };
  app.use(session(sessionOptions));
  app.use(passport.session());

  const retryAttempts = getOpenIdRetryAttempts();
  const retryDelay = getOpenIdRetryDelay();
  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    if (await registerOpenIdStrategies()) {
      return;
    }
    if (attempt < retryAttempts) {
      logger.warn(
        `OpenID Connect setup attempt ${attempt}/${retryAttempts} failed. Retrying in ${retryDelay}ms.`,
      );
      await wait(retryDelay);
    }
  }

  logger.error('OpenID Connect configuration failed - strategy not registered.');
  scheduleOpenIdRetry();
}

/**
 *
 * @param {Express.Application} app
 */
const configureSocialLogins = async (app) => {
  logger.info('Configuring social logins...');

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(googleLogin());
    passport.use('googleAdmin', googleAdminLogin());
  }
  if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
    passport.use(facebookLogin());
    passport.use('facebookAdmin', facebookAdminLogin());
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(githubLogin());
    passport.use('githubAdmin', githubAdminLogin());
  }
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    passport.use(discordLogin());
    passport.use('discordAdmin', discordAdminLogin());
  }
  if (process.env.APPLE_CLIENT_ID && process.env.APPLE_PRIVATE_KEY_PATH) {
    passport.use(appleLogin());
    passport.use('appleAdmin', appleAdminLogin());
  }
  if (
    process.env.OPENID_CLIENT_ID &&
    (isEnabled(process.env.OPENID_USE_PKCE) || process.env.OPENID_CLIENT_SECRET?.trim()) &&
    process.env.OPENID_ISSUER &&
    process.env.OPENID_SCOPE &&
    process.env.OPENID_SESSION_SECRET
  ) {
    await configureOpenId(app);
  }
  if (
    process.env.SAML_ENTRY_POINT &&
    process.env.SAML_ISSUER &&
    process.env.SAML_CERT &&
    process.env.SAML_SESSION_SECRET
  ) {
    logger.info('Configuring SAML Connect...');
    const sessionExpiry = getSessionExpiry();
    const sessionOptions = {
      secret: process.env.SAML_SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: getLogStores(CacheKeys.SAML_SESSION),
      cookie: {
        maxAge: sessionExpiry,
        secure: shouldUseSecureCookie(),
      },
    };
    app.use(session(sessionOptions));
    app.use(passport.session());
    setupSaml();

    logger.info('SAML Connect configured.');
  }
};

module.exports = configureSocialLogins;
