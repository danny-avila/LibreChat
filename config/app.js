import loader from "./loader";
const env = loader.all();

const sessionExpiry = eval(env.SESSION_EXPIRY);
const isProduction = env.NODE_ENV === 'production';

// Legacy Fallbacks - Will be removed in future versions
const legacy = {
  client: isProduction ? env.CLIENT_URL_PROD : env.CLIENT_URL_DEV,
  server: isProduction ? env.SERVER_URL_PROD : env.SERVER_URL_DEV,
  jwt: isProduction ? env.JWT_SECRET_PROD : env.JWT_SECRET_DEV,
}
const isLegacy = legacy.client || legacy.server || legacy.jwt;

// TODO: simpily when legacy fallbacks are removed
const clientDomain = env.DOMAIN_CLIENT || legacy.client || 'http://localhost:3090';
const serverDomain = env.DOMAIN_SERVER || legacy.server || 'http://localhost:3080';
const jwtSecret = env.JWT_SECRET || legacy.jwt;

/**
 * Validate that all required environment variables are set
 */
const requiredKeys = [
  'NODE_ENV',
  'JWT_SECRET',
];

const missingKeys = requiredKeys.map(key => {
  const variable = env.get(key);
  if (variable === undefined || variable === null) {
    return key;
  }
}).filter(value => value !== undefined);

// Throw an error if any required keys are missing
// TODO: remove legacy check in the future
if (!isLegacy && missingKeys.length) {
  const message = `
    The following required env variables are missing:
        ${missingKeys.toString()}.
    Please add them to your ${envFile} file
  `;
  throw new Error(message);
}

// Check JWT secret for default
if (jwtSecret === 'secret') {
  console.warn('Warning: JWT_SECRET is set to default value');
}

/**
 * Export the config object
 */
module.exports = {
  publicAccess: env.PUBLIC_ACCESS || true,
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
  // Get any env variable - probably not needed
  get: env.get
};