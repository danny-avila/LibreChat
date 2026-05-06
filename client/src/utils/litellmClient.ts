// New module — does not replace LibreChat's existing endpoint config; intended for future xcity-tokenhub-as-default rollout.
//
// This file exposes a thin browser-side client for the xcity-home → tokenhub flow:
//   1. Fetch a per-user LiteLLM bearer from xcity-home (cookie-authenticated).
//   2. Cache it in `sessionStorage` (per CLAUDE.md: never `localStorage` for tokens).
//   3. Forward `/v1/models` and `/v1/chat/completions` to tokenhub with that bearer.
//
// LibreChat's existing endpoint plumbing (api/server/services/Endpoints/* and
// client/src/data-provider/*) is untouched. A future config flag can switch
// the active completion path through this module.

const LITELLM_BASE = 'https://tokenhub.xcity.one';
const KEY_ENDPOINT = 'https://www.xcity.one/api/me/litellm-key';
const STORAGE_KEY = 'litellm_key_v1';
const CACHE_TTL_MS = 30 * 60 * 1000;

interface CachedKey {
  key: string;
  expires: number;
}

interface ModelsResponse {
  data: Array<{ id: string }>;
}

let cached: CachedKey | null = null;

function readFromSessionStorage(): CachedKey | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  const stored = window.sessionStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as CachedKey;
    if (typeof parsed.key !== 'string' || typeof parsed.expires !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeToSessionStorage(value: CachedKey): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function removeFromSessionStorage(): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}

/**
 * Resolve the current user's LiteLLM bearer.
 *
 * Returns a cached key when one is present and unexpired; otherwise hits
 * `https://www.xcity.one/api/me/litellm-key` with `credentials: 'include'`
 * so the browser forwards the xcity-home Supabase session cookie.
 *
 * Throws if xcity-home returns a non-2xx (typically because the user is
 * not signed in to xcity.one). Callers should redirect to xcity-home login
 * on failure.
 */
export async function getLiteLlmKey(): Promise<string> {
  if (cached && Date.now() < cached.expires) return cached.key;

  const stored = readFromSessionStorage();
  if (stored && Date.now() < stored.expires) {
    cached = stored;
    return stored.key;
  }

  const response = await fetch(KEY_ENDPOINT, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`xcity auth failed: ${response.status}`);
  }
  const payload = (await response.json()) as { key: string };
  if (!payload.key) {
    throw new Error('xcity auth response missing `key`');
  }

  const next: CachedKey = { key: payload.key, expires: Date.now() + CACHE_TTL_MS };
  cached = next;
  writeToSessionStorage(next);
  return next.key;
}

/**
 * Drop both the in-memory and `sessionStorage` cached LiteLLM key.
 *
 * Used after a 401 from tokenhub (the user's key was rotated by the
 * xcity-home Stripe webhook) so the next call re-fetches a fresh key.
 */
export function clearLiteLlmKey(): void {
  cached = null;
  removeFromSessionStorage();
}

/**
 * List the model IDs the current user is allowed to invoke through tokenhub.
 *
 * Calls `GET https://tokenhub.xcity.one/v1/models` with the user's bearer.
 * The returned IDs match LiteLLM's `models[]` whitelist on the user's key.
 */
export async function listAllowedModels(): Promise<string[]> {
  const key = await getLiteLlmKey();
  const response = await fetch(`${LITELLM_BASE}/v1/models`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    throw new Error(`models list failed: ${response.status}`);
  }
  const body = (await response.json()) as ModelsResponse;
  return body.data.map((m) => m.id);
}

/**
 * Forward a chat-completion payload to tokenhub.
 *
 * Retries exactly once on a 401 — that almost always means the cached key
 * was rotated server-side (Stripe webhook → `rotateKeyForUser`). The retry
 * fetches a fresh key first, then re-issues the request.
 */
export async function callChatCompletion(payload: Record<string, unknown>): Promise<unknown> {
  const key = await getLiteLlmKey();
  const response = await fetch(`${LITELLM_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (response.status === 401) {
    clearLiteLlmKey();
    const retryKey = await getLiteLlmKey();
    const retry = await fetch(`${LITELLM_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${retryKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return retry.json();
  }
  return response.json();
}
