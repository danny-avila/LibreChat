const env = process.env;

const sessionExpiry = eval(env.SESSION_EXPIRY);
const isProduction = env.NODE_ENV === 'production';

// Legacy Fallbacks - Will be removed in future versions
const legacyClientDomain = isProduction ? env.CLIENT_URL_PROD : env.CLIENT_URL_DEV;
const legacyServerDomain = isProduction ? env.SERVER_URL_PROD : env.SERVER_URL_DEV;
const legacyJwtSecret = isProduction ? env.JWT_SECRET_PROD : env.JWT_SECRET_DEV;

// TODO: simpily when legacy fallbacks are removed
const clientDomain = env.DOMAIN_CLIENT || legacyClientDomain || 'http://localhost:3090';
const serverDomain = env.DOMAIN_SERVER || legacyServerDomain || 'http://localhost:3080';
const jwtSecret = env.JWT_SECRET || legacyJwtSecret;

module.exports = {
  isProduction,
  domains: {
    client: clientDomain,
    server: serverDomain
  },
  jwt: {
    secret: jwtSecret,
    refreshSecret: env.JWT_REFRESH_SECRET,
    sessionExpiry: sessionExpiry,
  },
};