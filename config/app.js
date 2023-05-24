import loader from "./loader";
const env = loader.all();

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

/**
 * Validate that all required environment variables are set
 */
const requiredKeys = [
  'NODE_ENV',
  // I want to put more in here, help with install issues but I would break legacy
];

const missingKeys = requiredKeys.map(key => {
  const variable = env.get(key);
  if (variable === undefined || variable === null) {
    return key;
  }
}).filter(value => value !== undefined);

// Throw an error if any required keys are missing
if (missingKeys.length) {
  const message = `
    The following required env variables are missing:
        ${missingKeys.toString()}.
    Please add them to your ${envFile} file
  `;
  throw new Error(message);
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
  // Get any env variable - temp
  get: env.get
};