import type { IUser } from '@librechat/data-schemas';

/**
 * BKL — authenticated user identity forwarding to the ai-api (Python IRE service).
 *
 * The ai-api enforces a BIMS-based ACL on private matters (`open10=false`). To
 * permit a legitimate user to see their own private matters it must know *who*
 * is asking. That identity travels as request headers
 * (`src/api/utils/user_identity.py`):
 *
 *   X-BKL-User-Sid   numeric BKL staff sid — the primary ACL key
 *   X-BKL-User-Id    BKL string user id (e.g. "JHSON")
 *   X-BKL-User-Nm    URL-encoded display name (debug/logging only)
 *   X-LC-User-Id     LibreChat MongoDB _id (tracing)
 *   X-LC-User-Email  LibreChat email (tracing / fallback lookup)
 *   X-LC-User-Role   "ADMIN" => ai-api bypasses ACL; otherwise normal user
 *
 * The BIMS identifiers are persisted onto the LibreChat user document at login
 * (`api/strategies/localStrategy.js`) as `bkl_sid` / `bkl_user_id` /
 * `bkl_user_nm`, and survive into `req.user` because the JWT strategy loads the
 * user with `.lean()` (raw doc, schema-less fields included).
 *
 * Defensive by design: when the user has no `bkl_sid` (e.g. unmapped account)
 * the sid header is omitted entirely so the ai-api treats the caller as
 * unidentified (safe-deny on private matters) rather than impersonating a sid.
 */

/** LibreChat user document augmented with the BIMS identity fields. */
export type BklUser = Partial<IUser> & {
  bkl_sid?: number | string | null;
  bkl_user_id?: string | null;
  bkl_user_nm?: string | null;
};

/** Minimal request shape — anything carrying an authenticated `user`. */
export interface BklIdentityRequest {
  user?: BklUser | null;
}

/** Header name constants kept in one place to avoid drift across call sites. */
export const BKL_IDENTITY_HEADERS = [
  'X-BKL-User-Sid',
  'X-BKL-User-Id',
  'X-BKL-User-Nm',
  'X-LC-User-Id',
  'X-LC-User-Email',
  'X-LC-User-Role',
] as const;

function hasText(value: unknown): value is string | number {
  return value != null && String(value).trim() !== '';
}

/**
 * Builds the BKL/BIMS identity header object from an authenticated request.
 *
 * @param req - Express-style request carrying `req.user` (or any object with a `user`).
 * @returns A header map ready to merge into an outbound request to the ai-api.
 *          Empty when there is no authenticated user.
 */
export function bklIdentityHeaders(req?: BklIdentityRequest | null): Record<string, string> {
  const headers: Record<string, string> = {};
  const user = req?.user;
  if (!user) {
    return headers;
  }

  /** Primary ACL key. Omit when missing so the ai-api safe-denies private matters. */
  if (hasText(user.bkl_sid)) {
    headers['X-BKL-User-Sid'] = String(user.bkl_sid);
  }

  /**
   * BKL string id. Fall back to `username` for users who logged in before the
   * BIMS-field migration (LibreChat username === BIMS userId; case normalised
   * by the ai-api ACLFilter). Mirrors the bklProxy fallback.
   */
  const bklUserId = user.bkl_user_id || user.username || null;
  if (hasText(bklUserId)) {
    headers['X-BKL-User-Id'] = String(bklUserId);
  }

  /**
   * Display name — URL-encoded because the ai-api decodes with
   * `urllib.parse.unquote`, and HTTP headers must be ASCII (Korean names break
   * the Fetch API ByteString conversion otherwise). Debug/logging only.
   */
  const displayName = user.bkl_user_nm || user.name || null;
  if (hasText(displayName)) {
    headers['X-BKL-User-Nm'] = encodeURIComponent(String(displayName));
  }

  if (hasText(user._id)) {
    headers['X-LC-User-Id'] = String(user._id);
  }
  if (hasText(user.email)) {
    headers['X-LC-User-Email'] = String(user.email);
  }

  /**
   * Role passthrough. The ai-api grants an ACL bypass only when this equals
   * "ADMIN", so forwarding LibreChat's own role value (USER | ADMIN) maps
   * operator accounts to bypass and everyone else to normal ACL.
   */
  if (hasText(user.role)) {
    headers['X-LC-User-Role'] = String(user.role);
  }

  return headers;
}

/**
 * Enriches a configured header map with the request's BKL identity, but only
 * when the endpoint has opted in by declaring an `X-BKL-*` / `X-LC-*` header
 * (so non-BKL custom endpoints never receive identity headers).
 *
 * Identity values computed from `req.user` take precedence over the configured
 * (often placeholder) values, so e.g. a stale `X-BKL-User-Id: {{LIBRECHAT_USER_ID}}`
 * is replaced with the real BKL user id and `X-BKL-User-Sid` is added.
 *
 * @param headers - The endpoint's configured headers (may contain placeholders).
 * @param req - Express-style request carrying `req.user`.
 * @returns The (possibly) enriched headers. The input is never mutated.
 */
export function withBklIdentityHeaders(
  headers: Record<string, string> | undefined,
  req?: BklIdentityRequest | null,
): Record<string, string> | undefined {
  if (!headers) {
    return headers;
  }

  const optedIn = Object.keys(headers).some((key) => /^x-(bkl|lc)-/i.test(key));
  if (!optedIn) {
    return headers;
  }

  const identity = bklIdentityHeaders(req);
  if (Object.keys(identity).length === 0) {
    return headers;
  }

  return { ...headers, ...identity };
}
