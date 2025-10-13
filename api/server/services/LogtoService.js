const fetch = require('node-fetch');

let dataSchemasLogger;
const getLogger = () => {
  if (!dataSchemasLogger) {
    ({ logger: dataSchemasLogger } = require('@librechat/data-schemas'));
  }

  return dataSchemasLogger;
};

const sanitizeBaseUrl = (url) => url.replace(/\/+$/, '');

const getLogtoBaseUrl = () => {
  if (process.env.LOGTO_APP_BASE_URL) {
    return sanitizeBaseUrl(process.env.LOGTO_APP_BASE_URL);
  }

  return null;
};

let cachedClientToken;
let cachedClientTokenExpiry = 0;
let cachedClientTokenKey;

const getLogtoClientCredentials = (baseUrl) => {
  const clientId = process.env.LOGTO_APP_ID;
  const clientSecret = process.env.LOGTO_APP_SECRET;
  const resource = baseUrl ? `${baseUrl}/api` : null;

  if (!baseUrl || !clientId || !clientSecret || !resource) {
    return null;
  }

  return { baseUrl, clientId, clientSecret, resource };
};

const getClientCredentialsToken = async (credentials) => {
  const { baseUrl, clientId, clientSecret, resource } = credentials;
  const cacheKey = `${baseUrl}|${clientId}|${clientSecret}|${resource}`;

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
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        resource,
        scope: 'all',
      }),
    });

    if (!response.ok) {
      getLogger().warn('[getLogtoAuthorizationToken] Failed to fetch management token', {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    let payload;

    try {
      payload = await response.json();
    } catch (error) {
      getLogger().warn(
        '[getLogtoAuthorizationToken] Failed to parse token response as JSON',
        error,
      );
      return null;
    }

    const accessToken = payload?.access_token;
    if (!accessToken) {
      getLogger().warn('[getLogtoAuthorizationToken] Token response missing `access_token` field');
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
    getLogger().error('[getLogtoAuthorizationToken] Unable to fetch management token', error);
    return null;
  }
};

const getLogtoAuthorizationToken = async (baseUrl) => {
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
      getLogger().warn('[getLogtoUserIdByEmail] Logto API request failed', {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    let payload;

    try {
      payload = await response.json();
    } catch (error) {
      getLogger().warn('[getLogtoUserIdByEmail] Failed to parse Logto response as JSON', error);
      return null;
    }

    const results = Array.isArray(payload) ? payload : payload?.data;
    if (!Array.isArray(results) || results.length === 0) {
      return null;
    }

    return extractUserId(results[0]);
  } catch (error) {
    getLogger().error('[getLogtoUserIdByEmail] Unable to retrieve Logto user ID', error);
    return null;
  }
};

const describeLogtoConfiguration = () => {
  const baseUrl = getLogtoBaseUrl();
  const clientId = process.env.LOGTO_APP_ID;
  const clientSecret = process.env.LOGTO_APP_SECRET;
  const effectiveResource = baseUrl ? `${baseUrl}/api` : null;
  const hasClientCredentials = Boolean(clientId && clientSecret);
  const canQueryManagementApi = hasClientCredentials && Boolean(effectiveResource);

  return {
    baseUrl,
    clientIdSet: Boolean(clientId),
    clientSecretSet: Boolean(clientSecret),
    effectiveResource,
    hasClientCredentials,
    canQueryManagementApi,
  };
};

module.exports = {
  getLogtoUserIdByEmail,
  describeLogtoConfiguration,
};
