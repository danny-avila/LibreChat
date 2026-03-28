import { tenantStorage, logger } from '@librechat/data-schemas';
import type { Request, Response, NextFunction } from 'express';

/**
 * Pre-authentication tenant context middleware for unauthenticated routes.
 *
 * Reads the tenant identifier from the `X-Tenant-Id` request header and wraps
 * downstream handlers in `tenantStorage.run()` so that Mongoose queries and
 * config resolution run within the correct tenant scope.
 *
 * **Where to use**: Mount on routes that must be tenant-aware before
 * authentication has occurred:
 * - `GET /api/config` — login page needs tenant-specific config (social logins, registration)
 * - `/api/auth/*` — login, register, password reset
 * - `/oauth/*` — OAuth callback flows
 * - `GET /api/share/:shareId` — public shared conversation links
 *
 * **How the header gets set**: The deployment's reverse proxy, auth gateway,
 * or OpenID strategy sets `X-Tenant-Id` based on subdomain, path, or OIDC claim.
 * This middleware does NOT resolve tenants from subdomains or tokens — that is
 * the responsibility of the deployment layer (private fork).
 *
 * **Design**: Intentionally minimal. No subdomain parsing, no OIDC claim
 * extraction, no YAML-driven strategy. The private fork can:
 * 1. Set the header in its reverse proxy / ingress (simplest),
 * 2. Replace this middleware's resolver logic entirely, or
 * 3. Layer additional resolution on top (e.g., OpenID `tenant` claim → header).
 *
 * If no header is present, downstream runs without tenant ALS context (same as
 * single-tenant mode). This preserves backward compatibility for OSS deployments.
 */
export function preAuthTenantMiddleware(req: Request, res: Response, next: NextFunction): void {
  const tenantId = req.headers['x-tenant-id'];

  // No header or empty value — pass through without tenant context
  if (!tenantId || typeof tenantId !== 'string') {
    next();
    return;
  }

  logger.debug(`[preAuthTenant] Resolved tenant from header: ${tenantId}`);

  return void tenantStorage.run({ tenantId }, async () => {
    next();
  });
}
