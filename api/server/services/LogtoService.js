const fetch = require('node-fetch');
const { logger } = require('@librechat/data-schemas');

const sanitizeBaseUrl = (url) => url.replace(/\/+$/, '');

const getLogtoBaseUrl = () => {
  if (process.env.LOGTO_BASE_URL) {
    return sanitizeBaseUrl(process.env.LOGTO_BASE_URL);
  }

  if (process.env.LOGTO_TENANT_ID) {
    return `https://${process.env.LOGTO_TENANT_ID}.logto.app`;
  }

  return null;
};

let cachedClientToken;
let cachedClientTokenExpiry = 0;
let cachedClientTokenKey;

const getLogtoClientCredentials = (baseUrl) => {
  const clientId = process.env.LOGTO_APP_ID || process.env.LOGTO_CLIENT_ID;
  const clientSecret = process.env.LOGTO_APP_SECRET || process.env.LOGTO_CLIENT_SECRET;
  const resource = process.env.LOGTO_MANAGEMENT_RESOURCE || (baseUrl ? `${baseUrl}/api` : null);

  if (!baseUrl || !clientId || !clientSecret || !resource) {
    return null;
  }

  return { baseUrl, clientId, clientSecret, resource };
};

const getClientCredentialsToken = async (credentials) => {
  const { baseUrl, clientId, clientSecret, resource } = credentials;
  const cacheKey = `${baseUrl}|${clientId}|${resource}`;

  if (
    cachedClientToken &&
    cachedClientTokenKey === cacheKey &&
    cachedClientTokenExpiry > Date.now()
  ) {
    return cachedClientToken;
  }

  try {
    const response = await fetch(`${baseUrl}/oidc/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        resource,
      }),
    });

    if (!response.ok) {
      logger.warn('[getLogtoAuthorizationToken] Failed to fetch management token', {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    let payload;

    try {
      payload = await response.json();
    } catch (error) {
      logger.warn('[getLogtoAuthorizationToken] Failed to parse token response as JSON', error);
      return null;
    }

    const accessToken = payload?.access_token;
    if (!accessToken) {
      logger.warn('[getLogtoAuthorizationToken] Token response missing `access_token` field');
      return null;
    }

    const expiresIn = Number(payload?.expires_in);
    if (Number.isFinite(expiresIn) && expiresIn > 0) {
      cachedClientTokenExpiry = Date.now() + Math.max(0, expiresIn - 30) * 1000;
    } else {
      cachedClientTokenExpiry = Date.now() + 5 * 60 * 1000;
    }

    cachedClientToken = accessToken;
    cachedClientTokenKey = cacheKey;
    return accessToken;
  } catch (error) {
    logger.error('[getLogtoAuthorizationToken] Unable to fetch management token', error);
    return null;
  }
};

const getLogtoAuthorizationToken = async (baseUrl) => {
  const apiKey = process.env.LOGTO_API_KEY;
  if (apiKey) {
    return apiKey;
  }

  const credentials = getLogtoClientCredentials(baseUrl);
  if (!credentials) {
    return null;
  }

  return await getClientCredentialsToken(credentials);
};

const extractUserId = (user) => {
  if (!user || typeof user !== 'object') {
    return null;
  }

  return user.id ?? user.userId ?? user.user_id ?? null;
};

const getLogtoUserIdByEmail = async (email) => {
  const baseUrl = getLogtoBaseUrl();

  if (!email || !baseUrl) {
    return null;
  }

  const token = await getLogtoAuthorizationToken(baseUrl);

  if (!token) {
    return null;
  }

  const searchParams = new URLSearchParams({
    limit: '1',
    search: email,
  });

  const requestUrl = `${baseUrl}/api/users?${searchParams.toString()}`;

  try {
    const response = await fetch(requestUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      logger.warn('[getLogtoUserIdByEmail] Logto API request failed', {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    let payload;

    try {
      payload = await response.json();
    } catch (error) {
      logger.warn('[getLogtoUserIdByEmail] Failed to parse Logto response as JSON', error);
      return null;
    }

    const results = Array.isArray(payload) ? payload : payload?.data;
    if (!Array.isArray(results) || results.length === 0) {
      return null;
    }

    return extractUserId(results[0]);
  } catch (error) {
    logger.error('[getLogtoUserIdByEmail] Unable to retrieve Logto user ID', error);
    return null;
  }
};

module.exports = {
  getLogtoUserIdByEmail,
};
