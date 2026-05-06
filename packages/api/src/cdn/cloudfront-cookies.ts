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

/**
 * Clears CloudFront signed cookies from the response.
 * Should be called during logout to revoke CDN access.
 */
export function clearCloudFrontCookies(res: Response): void {
  try {
    const config = getCloudFrontConfig();
    if (!config?.cookieDomain || config.imageSigning !== 'cookies') {
      return;
    }
    const options = {
      domain: config.cookieDomain,
      path: '/images',
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
    };
    res.clearCookie('CloudFront-Policy', options);
    res.clearCookie('CloudFront-Signature', options);
    res.clearCookie('CloudFront-Key-Pair-Id', options);
  } catch (error) {
    logger.warn('[clearCloudFrontCookies] Failed to clear cookies:', error);
  }
}

/**
 * Sets CloudFront signed cookies on the response for CDN access.
 * Returns true if cookies were set, false if CloudFront cookies are not enabled.
 */
export function setCloudFrontCookies(res: Response): boolean {
  const config = getCloudFrontConfig();
  if (
    !config ||
    config.imageSigning !== 'cookies' ||
    !config.privateKey ||
    !config.keyPairId ||
    !config.cookieDomain
  ) {
    return false;
  }

  try {
    const cookieExpiry = config.cookieExpiry ?? DEFAULT_COOKIE_EXPIRY;
    const expiresAtMs = Date.now() + cookieExpiry * 1000;
    const expiresAt = new Date(expiresAtMs);
    const expiresAtEpoch = Math.floor(expiresAtMs / 1000);

    const resourceUrl = `${config.domain.replace(/\/+$/, '')}/images/*`;

    const policy = JSON.stringify({
      Statement: [
        {
          Resource: resourceUrl,
          Condition: {
            DateLessThan: {
              'AWS:EpochTime': expiresAtEpoch,
            },
          },
        },
      ],
    });

    const signedCookies = getSignedCookies({
      keyPairId: config.keyPairId,
      privateKey: config.privateKey,
      policy,
    });

    const cookieOptions = {
      expires: expiresAt,
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
      domain: config.cookieDomain,
      path: '/images',
    };

    for (const key of REQUIRED_CF_COOKIES) {
      if (!signedCookies[key]) {
        logger.error(`[setCloudFrontCookies] Missing expected cookie from AWS SDK: ${key}`);
        return false;
      }
    }

    for (const key of REQUIRED_CF_COOKIES) {
      res.cookie(key, signedCookies[key], cookieOptions);
    }

    return true;
  } catch (error) {
    logger.error('[setCloudFrontCookies] Failed to generate signed cookies:', error);
    return false;
  }
}
