import { getSignedCookies } from '@aws-sdk/cloudfront-signer';
import { logger } from '@librechat/data-schemas';

import type { Response } from 'express';

import { INLINE_AVATAR_PATH_PREFIX, INLINE_IMAGE_PATH_PREFIX } from '~/storage/constants';
import { assertPathSegment } from '~/storage/validation';
import { s3Config } from '~/storage/s3/s3Config';
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
  storageRegion?: string | null;
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
  { userId, tenantId, storageRegion }: CloudFrontCookieScope,
  includeRegionInPath = false,
): Array<{ resource: string; path: string }> {
  if (!userId) {
    throw new Error('[CloudFront cookies] userId is required for private image access.');
  }

  const safeUserId = assertPolicyPathSegment('userId', userId);
  if (includeRegionInPath) {
    if (storageRegion) {
      assertPolicyPathSegment('storageRegion', storageRegion);
    }
    if (tenantId) {
      const safeTenantId = assertPolicyPathSegment('tenantId', tenantId);
      return [
        {
          resource: `${domain}/${INLINE_IMAGE_PATH_PREFIX}/r/*/t/${safeTenantId}/images/${safeUserId}/*`,
          path: `/${INLINE_IMAGE_PATH_PREFIX}`,
        },
        {
          resource: `${domain}/${INLINE_AVATAR_PATH_PREFIX}/r/*/t/${safeTenantId}/avatars/*`,
          path: `/${INLINE_AVATAR_PATH_PREFIX}`,
        },
      ];
    }

    return [
      {
        resource: `${domain}/${INLINE_IMAGE_PATH_PREFIX}/r/*/images/${safeUserId}/*`,
        path: `/${INLINE_IMAGE_PATH_PREFIX}`,
      },
      {
        resource: `${domain}/${INLINE_AVATAR_PATH_PREFIX}/r/*/avatars/*`,
        path: `/${INLINE_AVATAR_PATH_PREFIX}`,
      },
    ];
  }

  if (tenantId) {
    const safeTenantId = assertPolicyPathSegment('tenantId', tenantId);
    return [
      {
        resource: `${domain}/${INLINE_IMAGE_PATH_PREFIX}/t/${safeTenantId}/images/${safeUserId}/*`,
        path: `/${INLINE_IMAGE_PATH_PREFIX}`,
      },
      {
        resource: `${domain}/${INLINE_AVATAR_PATH_PREFIX}/t/${safeTenantId}/avatars/*`,
        path: `/${INLINE_AVATAR_PATH_PREFIX}`,
      },
    ];
  }

  return [
    {
      resource: `${domain}/${INLINE_IMAGE_PATH_PREFIX}/images/${safeUserId}/*`,
      path: `/${INLINE_IMAGE_PATH_PREFIX}`,
    },
    {
      resource: `${domain}/${INLINE_AVATAR_PATH_PREFIX}/avatars/*`,
      path: `/${INLINE_AVATAR_PATH_PREFIX}`,
    },
  ];
}

function getScopeCookiePaths(
  scope: CloudFrontCookieScope,
  { includeTenantRoot = false }: { includeTenantRoot?: boolean } = {},
): string[] {
  if (!scope.userId) {
    return [];
  }

  if (scope.storageRegion) {
    assertPolicyPathSegment('storageRegion', scope.storageRegion);
  }
  const safeUserId = assertPolicyPathSegment('userId', scope.userId);
  const safeTenantId = scope.tenantId ? assertPolicyPathSegment('tenantId', scope.tenantId) : null;
  const paths = [`/${INLINE_IMAGE_PATH_PREFIX}`, `/${INLINE_AVATAR_PATH_PREFIX}`];
  if (safeTenantId) {
    paths.push(`/t/${safeTenantId}/images/${safeUserId}`, `/t/${safeTenantId}/avatars`);
  } else {
    paths.push(`/images/${safeUserId}`, '/avatars');
  }
  if (safeTenantId && includeTenantRoot) {
    paths.push(`/t/${safeTenantId}`);
  }
  return paths;
}

function encodeCloudFrontCookieScope(scope: CloudFrontCookieScope): string {
  const payload = {
    userId: scope.userId ?? null,
    tenantId: scope.tenantId ?? null,
    storageRegion: scope.storageRegion ?? null,
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
      storageRegion?: unknown;
    };
    const scope: CloudFrontCookieScope = {};
    if (typeof parsed.userId === 'string') {
      scope.userId = assertPolicyPathSegment('userId', parsed.userId);
    }
    if (typeof parsed.tenantId === 'string') {
      scope.tenantId = assertPolicyPathSegment('tenantId', parsed.tenantId);
    }
    if (typeof parsed.storageRegion === 'string') {
      scope.storageRegion = assertPolicyPathSegment('storageRegion', parsed.storageRegion);
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
    const paths = new Set(['/images', '/avatars', '/r', '/i', '/a', '/']);
    const clearScope =
      config.includeRegionInPath && scope.userId && !scope.storageRegion
        ? {
            ...scope,
            storageRegion: config.storageRegion ?? s3Config.AWS_REGION ?? process.env.AWS_REGION,
          }
        : scope;
    if (clearScope.userId) {
      for (const path of getScopeCookiePaths(clearScope, {
        includeTenantRoot: true,
      })) {
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
    const includeRegionInPath = config.includeRegionInPath ?? false;
    const configuredStorageRegion =
      scope.storageRegion ?? config.storageRegion ?? s3Config.AWS_REGION ?? process.env.AWS_REGION;
    const scopedStorageRegion = includeRegionInPath ? configuredStorageRegion : scope.storageRegion;
    const effectiveScope = {
      ...scope,
      ...(scopedStorageRegion ? { storageRegion: scopedStorageRegion } : {}),
    };
    const policyScopes = getPolicyScopes(cleanDomain, effectiveScope, includeRegionInPath);
    const resourcesByPath = new Map<string, string[]>();
    for (const { resource, path } of policyScopes) {
      resourcesByPath.set(path, [...(resourcesByPath.get(path) ?? []), resource]);
    }

    const signedCookieSets = Array.from(resourcesByPath, ([path, resources]) => {
      if (resources.length > 1) {
        throw new Error('[CloudFront cookies] Multiple resources cannot share a cookie path.');
      }

      const policy = JSON.stringify({
        Statement: [
          {
            Resource: resources[0],
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
    const stalePaths = new Set(['/images', '/avatars', '/r', '/i', '/a']);
    if (previousScope?.userId) {
      for (const path of getScopeCookiePaths(previousScope)) {
        stalePaths.add(path);
      }
    }
    for (const path of getScopeCookiePaths(effectiveScope)) {
      stalePaths.add(path);
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
    res.cookie(CLOUDFRONT_SCOPE_COOKIE, encodeCloudFrontCookieScope(effectiveScope), {
      ...baseCookieOptions,
      path: '/',
    });

    logger.debug(
      `[setCloudFrontCookies] Issued signed CloudFront cookies (paths=${signedCookieSets.length}, expiresInSec=${cookieExpiry}).`,
    );

    return true;
  } catch (error) {
    logger.error('[setCloudFrontCookies] Failed to generate signed cookies:', error);
    return false;
  }
}
