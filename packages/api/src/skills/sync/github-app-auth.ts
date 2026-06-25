import jwt from 'jsonwebtoken';
import { logger } from '@librechat/data-schemas';

/**
 * GitHub App authentication for `skillSync.github` sources.
 *
 * A GitHub App credential (app id + RSA private key) can't be used as a static
 * PAT — the App credentials are long-lived but the *installation access token*
 * you actually call the REST API with expires after ~1 hour. So when a source
 * is configured with an App rather than a token, this module signs a short-lived
 * App JWT and mints an installation access token at sync time, caching it
 * in-process until shortly before expiry.
 *
 * Flow (per https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app):
 *   1. Build a short-lived App JWT (RS256, signed with the app private key).
 *   2. Resolve the installation id (configured, or discovered via
 *      `GET /repos/{owner}/{repo}/installation`).
 *   3. `POST /app/installations/{id}/access_tokens` → the installation token,
 *      scoped to this repo + read-only Contents + Metadata permissions.
 *
 * Signing uses `jsonwebtoken` (already a dependency of this package), which
 * reads the App's native PKCS#1 PEM (`-----BEGIN RSA PRIVATE KEY-----`)
 * directly — no offline PKCS#8 conversion needed.
 *
 * Failures throw `GitHubAppAuthError` (distinct from the GitHub REST client's
 * `SkillSyncError`) so callers can tell "the App credential is broken" apart
 * from "the sync request itself failed" and surface an operator-actionable
 * message instead of mislabeling it as a manifest/skill error.
 */

const GITHUB_API_BASE = 'https://api.github.com';
const TIMEOUT_MS = 15_000;
/** Refresh the installation token when it's within this window of expiry. */
const REFRESH_SKEW_MS = 5 * 60_000;

/**
 * Thrown for any failure in the App-auth path: signing, installation lookup,
 * token exchange, a malformed private key, or a token with no usable expiry.
 * Distinct type so the sync runner can branch on "credential/config problem"
 * and surface a precise operator hint.
 */
export class GitHubAppAuthError extends Error {
  /** Upstream HTTP status when the failure came from a GitHub call. */
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GitHubAppAuthError';
    this.status = status;
  }
}

/**
 * Operator-actionable message for a `GitHubAppAuthError`. Names the likely
 * cause and never includes token material.
 */
export function appAuthErrorMessage(err: GitHubAppAuthError, owner: string, repo: string): string {
  let hint = 'the App credential (appId / privateKey) is misconfigured';
  if (err.status === 401 || err.status === 403) {
    hint = 'the App credential (appId / privateKey) is rejected by GitHub';
  } else if (err.status === 404) {
    hint = `the GitHub App may not be installed on ${owner}/${repo}`;
  }
  return `GitHub App authentication failed — ${hint}. This is an operator config issue. Check server logs.`;
}

const ghHeaders = (bearer: string): Record<string, string> => ({
  accept: 'application/vnd.github+json',
  authorization: `Bearer ${bearer}`,
  'x-github-api-version': '2022-11-28',
  'user-agent': 'LibreChat-Skill-Sync',
});

/**
 * Normalize a PEM private key read from an environment variable. Accepts:
 *   - a raw multi-line PEM (`-----BEGIN RSA PRIVATE KEY-----\n...`)
 *   - a PEM with literal `\n` escapes (common when entered via single-line env)
 *   - a base64-encoded PEM
 *
 * Returns a PEM string that `crypto.createSign` can consume. Throws
 * `GitHubAppAuthError` if the value is none of the above.
 */
export function normalizePrivateKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes('-----BEGIN')) {
    return trimmed.includes('\\n') ? trimmed.replace(/\\n/g, '\n') : trimmed;
  }
  const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
  if (!decoded.includes('-----BEGIN')) {
    throw new GitHubAppAuthError(
      'GitHub App privateKey is neither a PEM nor a base64-encoded PEM.',
    );
  }
  return decoded;
}

/**
 * Build a short-lived App JWT signed with the app private key (RS256).
 * `iat` 60s in the past guards against clock skew; `exp` well under GitHub's
 * 10-minute cap. `iss` accepts the numeric app id or the App's client id.
 */
export function mintAppJwt(appId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  try {
    return jwt.sign({ iat: now - 60, exp: now + 540, iss: appId }, privateKeyPem, {
      algorithm: 'RS256',
    });
  } catch (err) {
    throw new GitHubAppAuthError(
      `Could not sign App JWT — privateKey is not a usable RSA private key: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

interface CachedToken {
  token: string;
  /** Epoch ms at which we should stop using this token. */
  refreshAt: number;
}

export interface GitHubAppTokenProviderOpts {
  appId: string;
  /** Raw value of the privateKey env var (PEM, escaped-PEM, or base64). */
  privateKey: string;
  owner: string;
  repo: string;
  /** Optional. If omitted, discovered via `GET /repos/{owner}/{repo}/installation`. */
  installationId?: string;
  /** Injected for testability; defaults to global fetch. */
  fetchFn?: typeof fetch;
}

/**
 * Returns an async `() => Promise<string>` that yields a valid installation
 * access token, minting + caching it as needed. The cache lives in this
 * closure — construct ONCE per source and reuse for the lifetime of the
 * process so the cache actually engages across syncs.
 *
 * The private key is NOT normalized eagerly — that's deferred to the first
 * mint, so a malformed `privateKey` surfaces as a `GitHubAppAuthError` through
 * the sync runner (an actionable per-source error) rather than throwing during
 * provider construction.
 */
export function createGitHubAppTokenProvider(
  opts: GitHubAppTokenProviderOpts,
): () => Promise<string> {
  const { appId, privateKey, owner, repo, installationId } = opts;
  const fetchFn = opts.fetchFn ?? fetch;
  let cached: CachedToken | null = null;

  async function ghJson<T>(
    method: 'GET' | 'POST',
    pathname: string,
    bearer: string,
    body?: unknown,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetchFn(`${GITHUB_API_BASE}${pathname}`, {
        method,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: body
          ? { ...ghHeaders(bearer), 'content-type': 'application/json' }
          : ghHeaders(bearer),
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      // Network failure / timeout. Never include the bearer in the message.
      logger.error('[SkillSync][GitHub App] auth request unreachable', {
        method,
        path: pathname,
        err: err instanceof Error ? err.message : String(err),
      });
      throw new GitHubAppAuthError(
        `GitHub App auth request failed (unreachable): ${method} ${pathname}`,
      );
    }
    if (!res.ok) {
      // Never log the JWT/token; only the failing path + status.
      logger.error('[SkillSync][GitHub App] auth request failed', {
        method,
        path: pathname,
        status: res.status,
      });
      throw new GitHubAppAuthError(
        `GitHub App auth failed: ${res.status} ${method} ${pathname}`,
        res.status,
      );
    }
    return (await res.json()) as T;
  }

  async function resolveInstallationId(appJwt: string): Promise<string> {
    if (installationId) return installationId;
    const result = await ghJson<{ id: number }>(
      'GET',
      `/repos/${owner}/${repo}/installation`,
      appJwt,
    );
    return String(result.id);
  }

  async function mint(): Promise<CachedToken> {
    const privateKeyPem = normalizePrivateKey(privateKey);
    const appJwt = mintAppJwt(appId, privateKeyPem);
    const id = await resolveInstallationId(appJwt);
    const token = await ghJson<{ token: string; expires_at: string }>(
      'POST',
      `/app/installations/${id}/access_tokens`,
      appJwt,
      {
        repositories: [repo],
        // Read-only scope: sync mirrors files, never writes back. Apps with
        // narrower permissions can also be installed in repos the App itself
        // doesn't have write access to.
        permissions: { contents: 'read', metadata: 'read' },
      },
    );
    const expiresAtMs = Date.parse(token.expires_at);
    if (Number.isNaN(expiresAtMs)) {
      // A token with no parseable expiry would poison the cache: `refreshAt`
      // would be NaN and `Date.now() < NaN` is always false, so we'd silently
      // re-mint on every request. Fail loud — this is a contract violation by
      // GitHub (or an unexpected response shape), not normal.
      logger.error('[SkillSync][GitHub App] token has no valid expires_at', {
        expires_at: token.expires_at,
      });
      throw new GitHubAppAuthError(
        'GitHub returned an installation token with no valid expires_at.',
      );
    }
    return { token: token.token, refreshAt: expiresAtMs - REFRESH_SKEW_MS };
  }

  return async function getToken(): Promise<string> {
    if (cached && Date.now() < cached.refreshAt) {
      return cached.token;
    }
    // On failure, leave `cached` untouched (null or the prior value) and let
    // the GitHubAppAuthError propagate — never cache a bad result.
    cached = await mint();
    return cached.token;
  };
}
