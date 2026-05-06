import { logger } from '@librechat/data-schemas';
import { getSignedCookies } from '@aws-sdk/cloudfront-signer';

import type { Response } from 'express';

import { getCloudFrontConfig } from './cloudfront';

const DEFAULT_COOKIE_EXPIRY = 1800;

const REQUIRED_CF_COOKIES = [
  'CloudFront-Policy',
  'CloudFront-Signature',
  'CloudFront-Key-Pair-Id',
] as const;

const unsafePolicySegmentPattern = /[?*[\]\s]/;

export interface CloudFrontCookieScope {
  userId?: string | null;
  tenantId?: string | null;
}

function assertPathSegment(value: string, label: string): void {
  if (value.includes('/') || value.includes('\\')) {
    throw new Error(`[CloudFront cookies] ${label} must not contain slashes.`);
  }
  if (value === '.' || value === '..' || value.includes('..')) {
    throw new Error(`[CloudFront cookies] ${label} must not contain path traversal.`);
  }
  if (
    unsafePolicySegmentPattern.test(value) ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    throw new Error(`[CloudFront cookies] ${label} contains unsafe policy characters.`);
  }
}

function getPolicyScopes(
  domain: string,
  { userId, tenantId }: CloudFrontCookieScope,
): Array<{ resource: string; path: string }> {
  if (!userId) {
    throw new Error('[CloudFront cookies] userId is required for private image access.');
  }

  assertPathSegment(userId, 'userId');
  if (tenantId) {
    assertPathSegment(tenantId, 'tenantId');
    return [
      {
        resource: `${domain}/t/${tenantId}/images/${userId}/*`,
        path: `/t/${tenantId}/images/${userId}`,
      },
      { resource: `${domain}/t/${tenantId}/avatars/*`, path: `/t/${tenantId}/avatars` },
    ];
  }

  return [
    { resource: `${domain}/images/${userId}/*`, path: `/images/${userId}` },
    { resource: `${domain}/avatars/*`, path: '/avatars' },
  ];
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
      paths.add(`/images/${scope.userId}`);
    }
    if (scope.tenantId) {
      paths.add(`/t/${scope.tenantId}`);
      paths.add(`/t/${scope.tenantId}/avatars`);
      if (scope.userId) {
        paths.add(`/t/${scope.tenantId}/images/${scope.userId}`);
      }
    }

    for (const path of paths) {
      const options = { ...baseOptions, path };
      res.clearCookie('CloudFront-Policy', options);
      res.clearCookie('CloudFront-Signature', options);
      res.clearCookie('CloudFront-Key-Pair-Id', options);
    }
  } catch (error) {
    logger.warn('[clearCloudFrontCookies] Failed to clear cookies:', error);
  }
}

/**
 * Sets CloudFront signed cookies on the response for CDN access.
 * Returns true if cookies were set, false if CloudFront cookies are not enabled.
 */
export function setCloudFrontCookies(res: Response, scope: CloudFrontCookieScope = {}): boolean {
  const config = getCloudFrontConfig();
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

    const baseCookieOptions = {
      expires: expiresAt,
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
      domain: config.cookieDomain,
    };

    for (const { cookies } of signedCookieSets) {
      for (const key of REQUIRED_CF_COOKIES) {
        if (!cookies[key]) {
          logger.error(`[setCloudFrontCookies] Missing expected cookie from AWS SDK: ${key}`);
          return false;
        }
      }
    }

    for (const { cookies, path } of signedCookieSets) {
      const cookieOptions = { ...baseCookieOptions, path };
      for (const key of REQUIRED_CF_COOKIES) {
        res.cookie(key, cookies[key], cookieOptions);
      }
    }

    return true;
  } catch (error) {
    logger.error('[setCloudFrontCookies] Failed to generate signed cookies:', error);
    return false;
  }
}
