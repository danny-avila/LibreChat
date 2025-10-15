// ./services/AutumnService.ts
// ----------------------------------------------------------------------------------
// Centralised wrapper for all interactions with UseAutumn billing API
// ----------------------------------------------------------------------------------
// This module must only be imported server‑side. Never expose the secret key to the
// client bundle!
// ----------------------------------------------------------------------------------

import { Autumn } from 'autumn-js';
import { v4 as uuidv4 } from 'uuid';

// -----------------------------------------------------------------------------
// ENV / CONFIG (already declared in the current server runtime)
// -----------------------------------------------------------------------------
/* eslint-disable @typescript-eslint/consistent-type-imports */
/*
  The following constants are expected to be globally available or injected via
  your framework's config system (e.g. process.env, Convex env, tRPC context, etc.)

  - applyUseAutumnKey                // Autumn secret API key (am_sk_…)
  - useAutumnApiBase                 // Base URL for all UseAutumn endpoints
  - useAutumnProductId               // Your Autumn product ID
  - useAutumnTokenCreditsFeatureId   // Feature holding the token‑credit balance
  - useAutumnHasSubscriptionFeatureId// Feature indicating a paid subscription
*/
/* global applyUseAutumnKey, useAutumnApiBase, useAutumnProductId, useAutumnTokenCreditsFeatureId, useAutumnHasSubscriptionFeatureId */

// -----------------------------------------------------------------------------
// Client instance (singleton)
// -----------------------------------------------------------------------------
export const autumn = new Autumn({
  secretKey: applyUseAutumnKey,
});

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 250;

/**
 * Generic retry helper with exponential back‑off.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  let attempt = 0;

  // eslint‑disable-next‑line no‑constant‑condition
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
function buildIdempotencyKey(customerId: string): string {
  const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : uuidv4();
  return `track-${customerId}-${uuid}`;
}

// -----------------------------------------------------------------------------
// Autumn API wrappers
// -----------------------------------------------------------------------------

/**
 * Fetch the user’s remaining token‑credit balance from Autumn.
 * @return Number of remaining credits (0 if the feature is missing).
 */
export async function fetchTokenBalanceAutumn(openidID: string): Promise<number> {
  const { data } = await withRetry(() =>
    autumn.customers.get(openidID),
  );

  const feature = data.features?.find(
    (f: { feature_id: string; balance?: number }) =>
      f.feature_id === useAutumnTokenCreditsFeatureId,
  );

  return feature?.balance ?? 0;
}

/**
 * Check if the customer currently has an active subscription.
 */
export async function hasSubscriptionAutumn(openidID: string): Promise<boolean> {
  const { data } = await withRetry(() =>
    autumn.check({
      customer_id: openidID,
      product_id:  useAutumnProductId,
      feature_id:  useAutumnHasSubscriptionFeatureId,
    }),
  );

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
}: {
  openidID: string;
  usedTokens: number;
  idempotencyKey?: string;
}): Promise<void> {
  await withRetry(() =>
    autumn.track({
      customer_id:    openidID,
      product_id:     useAutumnProductId,
      feature_id:     useAutumnTokenCreditsFeatureId,
      value:          usedTokens,
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
}: {
  openidID: string;
  email: string;
  fingerprint: string;
}): Promise<string> {
  const { data } = await withRetry(() =>
    autumn.attach({
      customer_id: openidID,
      product_id:  useAutumnProductId,
      force_checkout: true,
      customer_data: {
        email: email,
        fingerprint: email,
      },
    }),
  );

  return data.checkout_url;
}

// ----------------------------------------------------------------------------------
// NOTE: Remember to add the dependency in ./api/packages.json
//   "autumn-js": "^0.1.40",
//   "uuid": "^9.0.0" (only if crypto.randomUUID() is unavailable in your runtime)
// ----------------------------------------------------------------------------------
