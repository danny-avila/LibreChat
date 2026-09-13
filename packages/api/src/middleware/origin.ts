import { logger } from '@librechat/data-schemas';
import type { Request, RequestHandler } from 'express';

const SAME_ORIGIN_FETCH_SITES: ReadonlySet<string> = new Set(['same-origin', 'none']);
const MAX_LOGGED_HEADER_LENGTH = 200;

export interface SameOriginGuardOptions {
  /** Origins allowed to submit from another origin, such as `DOMAIN_CLIENT` and `DOMAIN_SERVER`. */
  trustedOrigins: ReadonlyArray<string | undefined>;
}

function toOrigin(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const { origin } = new URL(value);
    return origin === 'null' ? undefined : origin;
  } catch {
    return undefined;
  }
}

function matchesHost(origin: string, host: string | undefined): boolean {
  if (!host) {
    return false;
  }
  const { protocol, host: originHost } = new URL(origin);
  try {
    return new URL(`${protocol}//${host}`).host === originHost;
  } catch {
    return false;
  }
}

/**
 * A browser labels every request with `Sec-Fetch-Site`, which a page cannot set. Browsers
 * predating it still send `Origin` on a form POST, compared here against the `Host` it was sent
 * to. A request carrying neither header did not come from a browser page and passes.
 */
function isCrossSiteRequest(req: Request, trustedOrigins: ReadonlySet<string>): boolean {
  const originHeader = req.get('origin');
  const origin = toOrigin(originHeader);
  if (origin && trustedOrigins.has(origin)) {
    return false;
  }

  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite) {
    return !SAME_ORIGIN_FETCH_SITES.has(fetchSite);
  }
  if (!originHeader) {
    return false;
  }
  return !origin || !matchesHost(origin, req.get('host'));
}

const truncate = (value: string | undefined): string | undefined =>
  value?.slice(0, MAX_LOGGED_HEADER_LENGTH);

/**
 * Accepts a request only when the browser sent it from this application's own origin (or a
 * trusted one). Login endpoints set session cookies, so they should only honor submissions made
 * by the application's own pages.
 */
export function createSameOriginGuard({ trustedOrigins }: SameOriginGuardOptions): RequestHandler {
  const trusted: ReadonlySet<string> = new Set(
    trustedOrigins.flatMap((value) => toOrigin(value) ?? []),
  );

  return (req, res, next) => {
    if (!isCrossSiteRequest(req, trusted)) {
      next();
      return;
    }

    logger.warn('[requireSameOrigin] Rejected cross-site request', {
      method: req.method,
      path: `${req.baseUrl}${req.path}`,
      fetch_site: truncate(req.get('sec-fetch-site')),
      origin: truncate(req.get('origin')),
    });
    res.status(403).json({ message: 'Cross-site request rejected' });
  };
}
