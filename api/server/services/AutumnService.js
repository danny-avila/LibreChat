// ./services/AutumnService.js
// ----------------------------------------------------------------------------------
// Centralised wrapper for all interactions with UseAutumn billing API
// ----------------------------------------------------------------------------------
// This module must only be imported server‑side. Never expose the secret key to the
// client bundle!
// ----------------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// ENV / CONFIG
// -----------------------------------------------------------------------------
/*
  The following constants mirror the TypeScript version and keep the same names
  for easy comparison. Values are injected from the environment or fixed per task.

  - applyUseAutumnKey                // Autumn secret API key (am_sk_…)
  - useAutumnApiBase                 // Base URL for all UseAutumn endpoints
  - useAutumnProductId               // Your Autumn product ID
  - useAutumnTokenCreditsFeatureId   // Feature holding the token‑credit balance
  - useAutumnHasSubscriptionFeatureId// Feature indicating a paid subscription
*/
const applyUseAutumnKey = require('../api/utils/applyUseAutumnKey');
const useAutumnApiBase = startupConfig.useAutumnApiBase;
const useAutumnProductId = startupConfig.useAutumnProductId;
const useAutumnTokenCreditsFeatureId = startupConfig.useAutumnTokenCreditsFeatureId;
const useAutumnHasSubscriptionFeatureId = startupConfig.useAutumnHasSubscriptionFeatureId;

if (
  [applyUseAutumnKey,
   useAutumnApiBase,
   useAutumnProductId,
   useAutumnTokenCreditsFeatureId,
   useAutumnHasSubscriptionFeatureId].some(v => v == null)
) {
  throw new Error('Missing required Autumn configuration values');
}

// -----------------------------------------------------------------------------
// Low-level HTTP helper (no external deps; works on Node and Edge runtimes)
// -----------------------------------------------------------------------------
async function requestJson(method, path, body) {
  const url = path.startsWith('http') ? path : `${useAutumnApiBase}${path}`;

  const headers = {
    'Authorization': `Bearer ${applyUseAutumnKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // Prefer global fetch if available; otherwise use https fallback
  if (typeof fetch === 'function') {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const json = text ? safeJsonParse(text) : null;

    if (!response.ok) {
      const message = `${method} ${url} failed with ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = json ?? text;
      throw error;
    }

    return { data: json };
  }

  // Node https fallback (no node-fetch)
  const { request } = await import('node:https');
  const { URL } = await import('node:url');

  const u = new URL(url);

  const options = {
    method,
    hostname: u.hostname,
    path: `${u.pathname}${u.search}`,
    port: u.port || 443,
    headers,
  };

  const payload = body ? JSON.stringify(body) : undefined;
  if (payload) {
    options.headers['Content-Length'] = Buffer.byteLength(payload);
  }

  const raw = await new Promise((resolve, reject) => {
    const req = request(options, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const bodyStr = Buffer.concat(chunks).toString('utf8');
        const json = bodyStr ? safeJsonParse(bodyStr) : null;
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(json);
        } else {
          const message = `${method} ${url} failed with ${res.statusCode}`;
          const error = new Error(message);
          error.status = res.statusCode;
          error.payload = json ?? bodyStr;
          reject(error);
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

  return { data: raw };
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Client instance (shim) to mirror the TypeScript structure without autumn-js
// -----------------------------------------------------------------------------
export const autumn = {
  customers: {
    async get(customerId) {
      return requestJson('GET', `/customers/${encodeURIComponent(customerId)}`);
    },
  },
  async check(payload) {
    return requestJson('POST', '/check', payload);
  },
  async track(payload) {
    return requestJson('POST', '/track', payload);
  },
  async attach(payload) {
    return requestJson('POST', '/attach', payload);
  },
};

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 250;

/**
 * Generic retry helper with exponential back‑off.
 */
async function withRetry(fn, retries = MAX_RETRIES) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt > retries) throw error;
      const delay = INITIAL_BACKOFF_MS * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/**
 * Builds a predictable idempotency key so that usage events are never double‑billed.
 */
function buildIdempotencyKey(customerId) {
  const uuid = generateUuidV4();
  return `track-${customerId}-${uuid}`;
}

function generateUuidV4() {
  // Lightweight v4 UUID generator without external deps
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// -----------------------------------------------------------------------------
// Autumn API wrappers
// -----------------------------------------------------------------------------

/**
 * Fetch the user’s remaining token‑credit balance from Autumn.
 * @return Number of remaining credits (0 if the feature is missing).
 */
export async function fetchTokenBalanceAutumn({openidID}) {
  try {
    const { data } = await withRetry(() => autumn.customers.get(openidID));

    if (!data) return 0;

    const features = data.features;

    // Newer API shape: features is a map keyed by feature_id
    if (features && !Array.isArray(features) && typeof features === 'object') {
      const entry = features[useAutumnTokenCreditsFeatureId];
      if (entry && typeof entry.balance !== 'undefined') {
        const numeric = Number(entry.balance);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
      }
      if (typeof entry === 'number') {
        const numeric = Number(entry);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
      }
      return 0;
    }

    // Legacy shape: features is an array of { feature_id, balance }
    if (Array.isArray(features)) {
      const feature = features.find((f) => f && f.feature_id === useAutumnTokenCreditsFeatureId);
      if (feature && typeof feature.balance !== 'undefined') {
        const numeric = Number(feature.balance);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
      }
    }

    return 0;
  } catch {
    return 0;
  }
}

/**
 * Check if the customer currently has an active subscription.
 */
export async function hasSubscriptionAutumn({openidID, email}) {
  const payload = {
    customer_id: openidID,
    feature_id: useAutumnHasSubscriptionFeatureId,
  };

  // Include customer_data so /check can auto-create the customer if missing
  payload.customer_data = { email:email, fingerprint: email };

  const { data } = await withRetry(() => autumn.check(payload));

  return Boolean(data.allowed);
}

/**
 * Record token usage so that Autumn decrements the customer’s balance.
 * Idempotent thanks to the key.
 */
export async function recordUsageAutumn({
  openidID,
  usedTokens,
  idempotencyKey = buildIdempotencyKey(openidID),
}) {
  await withRetry(() =>
    autumn.track({
      customer_id: openidID,
      product_id: useAutumnProductId,
      feature_id: useAutumnTokenCreditsFeatureId,
      value: usedTokens,
      idempotency_key: idempotencyKey,
    }),
  );
}

/**
 * Create (or attach) a subscription checkout session when the user has no credits
 * and no existing subscription. Returns the Stripe Checkout URL.
 */
export async function createCheckoutAutumn({
  openidID,
  email,
  fingerprint,
}) {
  const { data } = await withRetry(() =>
    autumn.attach({
      customer_id: openidID,
      product_id: useAutumnProductId,
      force_checkout: true,
      customer_data: {
        email: email,
        fingerprint: email, // kept identical to the TS version for structural parity
      },
    }),
  );

  return data && data.checkout_url ? data.checkout_url : undefined;
}

// ----------------------------------------------------------------------------------
// NOTE: No external HTTP libraries are used. The module prefers global fetch
// and falls back to node:https, complying with the allowed dependencies policy.
// ----------------------------------------------------------------------------------


