import { getSignedCookies } from '@aws-sdk/cloudfront-signer';
import { logger } from '@librechat/data-schemas';

import type { Response } from 'express';

import { assertPathSegment } from '~/storage/validation';
import { getCloudFrontConfig } from './cloudfront';

const DEFAULT_COOKIE_EXPIRY = 1800;

const REQUIRED_CF_COOKIES = [
  'CloudFront-Policy',
  'CloudFront-Signature',
  'CloudFront-Key-Pair-Id',
] as const;

export const CLOUDFRONT_SCOPE_COOKIE = 'LibreChat-CloudFront-Scope';
const unsafePolicySegmentPattern = /[?*[\]\s]/;

export interface CloudFrontCookieScope {
  userId?: string | null;
  tenantId?: string | null;
}

type CookieOptions = {
  domain: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'none';
};

function assertPolicyPathSegment(label: string, value: string | null | undefined): string {
  const segment = assertPathSegment(label, value, 'CloudFront cookies');
  if (unsafePolicySegmentPattern.test(segment)) {
    throw new Error(`[CloudFront cookies] ${label} contains unsafe policy characters.`);
  }
  return segment;
}

function getPolicyScopes(
  domain: string,
  { userId, tenantId }: CloudFrontCookieScope,
): Array<{ resource: string; path: string }> {
  if (!userId) {
    throw new Error('[CloudFront cookies] userId is required for private image access.');
  }

  const safeUserId = assertPolicyPathSegment('userId', userId);
  if (tenantId) {
    const safeTenantId = assertPolicyPathSegment('tenantId', tenantId);
    return [
      {
        resource: `${domain}/t/${safeTenantId}/images/${safeUserId}/*`,
        path: `/t/${safeTenantId}/images/${safeUserId}`,
      },
      { resource: `${domain}/t/${safeTenantId}/avatars/*`, path: `/t/${safeTenantId}/avatars` },
    ];
  }

  return [
    { resource: `${domain}/images/${safeUserId}/*`, path: `/images/${safeUserId}` },
    { resource: `${domain}/avatars/*`, path: '/avatars' },
  ];
}

function getScopeCookiePaths(
  scope: CloudFrontCookieScope,
  { includeTenantRoot = false }: { includeTenantRoot?: boolean } = {},
): string[] {
  if (!scope.userId) {
    return [];
  }

  const safeUserId = assertPolicyPathSegment('userId', scope.userId);
  if (scope.tenantId) {
    const safeTenantId = assertPolicyPathSegment('tenantId', scope.tenantId);
    const paths = [`/t/${safeTenantId}/images/${safeUserId}`, `/t/${safeTenantId}/avatars`];
    if (includeTenantRoot) {
      paths.push(`/t/${safeTenantId}`);
    }
    return paths;
  }

  return [`/images/${safeUserId}`, '/avatars'];
}

function encodeCloudFrontCookieScope(scope: CloudFrontCookieScope): string {
  const payload = {
    userId: scope.userId ?? null,
    tenantId: scope.tenantId ?? null,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function parseCloudFrontCookieScope(
  value: string | null | undefined,
): CloudFrontCookieScope | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      userId?: unknown;
      tenantId?: unknown;
    };
    const scope: CloudFrontCookieScope = {};
    if (typeof parsed.userId === 'string') {
      scope.userId = assertPolicyPathSegment('userId', parsed.userId);
    }
    if (typeof parsed.tenantId === 'string') {
      scope.tenantId = assertPolicyPathSegment('tenantId', parsed.tenantId);
    }
    return scope.userId ? scope : null;
  } catch {
    return null;
  }
}

function clearCookiePaths(
  res: Response,
  baseOptions: CookieOptions,
  paths: Iterable<string>,
): void {
  for (const path of paths) {
    const options = { ...baseOptions, path };
    for (const key of REQUIRED_CF_COOKIES) {
      res.clearCookie(key, options);
    }
  }
}

/**
 * Clears CloudFront signed cookies from the response.
 * Should be called during logout to revoke CDN access.
 */
export function clearCloudFrontCookies(res: Response, scope: CloudFrontCookieScope = {}): void {
  try {
    const config = getCloudFrontConfig();
    if (!config?.cookieDomain) {
      return;
    }
    const baseOptions = {
      domain: config.cookieDomain,
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
    };
    const paths = new Set(['/images', '/avatars', '/']);
    if (scope.userId) {
      for (const path of getScopeCookiePaths(scope, { includeTenantRoot: true })) {
        paths.add(path);
      }
    }

    clearCookiePaths(res, baseOptions, paths);
    res.clearCookie(CLOUDFRONT_SCOPE_COOKIE, { ...baseOptions, path: '/' });
  } catch (error) {
    logger.warn('[clearCloudFrontCookies] Failed to clear cookies:', error);
  }
}

/**
 * Sets CloudFront signed cookies on the response for CDN access.
 * Returns true if cookies were set, false if CloudFront cookies are not enabled.
 */
export function setCloudFrontCookies(
  res: Response,
  scope: CloudFrontCookieScope = {},
  previousScope: CloudFrontCookieScope | null = null,
): boolean {
  const config = getCloudFrontConfig();
  if (
    config?.imageSigning === 'cookies' &&
    config.privateKey &&
    config.keyPairId &&
    config.cookieDomain &&
    !scope.userId
  ) {
    logger.warn('[setCloudFrontCookies] CloudFront configured but userId missing from scope');
    return false;
  }
  if (
    !config ||
    config.imageSigning !== 'cookies' ||
    !config.privateKey ||
    !config.keyPairId ||
    !config.cookieDomain ||
    !scope.userId
  ) {
    return false;
  }

  try {
    const { keyPairId, privateKey } = config;
    const cookieExpiry = config.cookieExpiry ?? DEFAULT_COOKIE_EXPIRY;
    const expiresAtMs = Date.now() + cookieExpiry * 1000;
    const expiresAt = new Date(expiresAtMs);
    const expiresAtEpoch = Math.floor(expiresAtMs / 1000);

    const cleanDomain = config.domain.replace(/\/+$/, '');
    const policyScopes = getPolicyScopes(cleanDomain, scope);
    // CloudFront custom-policy cookies are scoped to one resource, so issue
    // separate path-specific cookie sets for private files and shared avatars.
    const signedCookieSets = policyScopes.map(({ resource, path }) => {
      const policy = JSON.stringify({
        Statement: [
          {
            Resource: resource,
            Condition: {
              DateLessThan: {
                'AWS:EpochTime': expiresAtEpoch,
              },
            },
          },
        ],
      });

      return {
        path,
        cookies: getSignedCookies({
          keyPairId,
          privateKey,
          policy,
        }),
      };
    });

    const sharedCookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
      domain: config.cookieDomain,
    };
    const stalePaths = new Set(['/images', '/avatars']);
    if (previousScope?.userId) {
      for (const path of getScopeCookiePaths(previousScope)) {
        stalePaths.add(path);
      }
    }

    for (const { cookies } of signedCookieSets) {
      for (const key of REQUIRED_CF_COOKIES) {
        if (!cookies[key]) {
          logger.error(`[setCloudFrontCookies] Missing expected cookie from AWS SDK: ${key}`);
          return false;
        }
      }
    }

    clearCookiePaths(res, sharedCookieOptions, stalePaths);
    const baseCookieOptions = { ...sharedCookieOptions, expires: expiresAt };

    for (const { cookies, path } of signedCookieSets) {
      const cookieOptions = { ...baseCookieOptions, path };
      for (const key of REQUIRED_CF_COOKIES) {
        res.cookie(key, cookies[key], cookieOptions);
      }
    }
    res.cookie(CLOUDFRONT_SCOPE_COOKIE, encodeCloudFrontCookieScope(scope), {
      ...baseCookieOptions,
      path: '/',
    });

    return true;
  } catch (error) {
    logger.error('[setCloudFrontCookies] Failed to generate signed cookies:', error);
    return false;
  }
}
