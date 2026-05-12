import { useCallback, useEffect, useRef, useState } from 'react';

import type { SyntheticEvent } from 'react';
import type { TStartupConfig } from 'librechat-data-provider';

type CloudFrontCookieRefreshConfig = NonNullable<
  NonNullable<TStartupConfig['cloudFront']>['cookieRefresh']
>;

type ImageErrorHandler = (event: SyntheticEvent<HTMLImageElement, Event>) => void;

let cookieRefreshConfig: CloudFrontCookieRefreshConfig | undefined;
let refreshPromise: Promise<boolean> | null = null;

function getRefreshConfig(
  startupConfig?: Pick<TStartupConfig, 'cloudFront'> | null,
): CloudFrontCookieRefreshConfig | undefined {
  return startupConfig?.cloudFront?.cookieRefresh ?? cookieRefreshConfig;
}

function getBaseUrl(): string {
  return typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value, getBaseUrl());
  } catch {
    return null;
  }
}

export function configureCloudFrontCookieRefresh(
  startupConfig?: Pick<TStartupConfig, 'cloudFront'> | null,
): void {
  cookieRefreshConfig = startupConfig?.cloudFront?.cookieRefresh;
}

export function isCloudFrontMediaUrl(
  url: string | null | undefined,
  startupConfig?: Pick<TStartupConfig, 'cloudFront'> | null,
): boolean {
  const config = getRefreshConfig(startupConfig);
  if (!url || !config?.domain) {
    return false;
  }

  const mediaUrl = parseUrl(url);
  const cloudFrontUrl = parseUrl(config.domain);
  return mediaUrl?.origin === cloudFrontUrl?.origin;
}

export function withCloudFrontCacheBuster(url: string): string {
  const parsed = parseUrl(url);
  if (!parsed) {
    return url;
  }

  parsed.searchParams.set('_cf_refresh', Date.now().toString());
  return parsed.toString();
}

export function refreshCloudFrontCookiesOnce(): Promise<boolean> {
  const config = getRefreshConfig();
  if (!config?.endpoint) {
    return Promise.resolve(false);
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = fetch(config.endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) {
        return false;
      }

      const payload = (await response.json()) as { ok?: boolean };
      return payload.ok === true;
    })
    .catch(() => false)
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export function useCloudFrontImageRetry(src: string | undefined, onError?: ImageErrorHandler) {
  const [imageSrc, setImageSrc] = useState(src ?? '');
  const retriedSrcRef = useRef<string | null>(null);

  useEffect(() => {
    setImageSrc(src ?? '');
    retriedSrcRef.current = null;
  }, [src]);

  const handleError = useCallback(
    async (event: SyntheticEvent<HTMLImageElement, Event>) => {
      const originalSrc = src ?? '';
      if (
        !originalSrc ||
        retriedSrcRef.current === originalSrc ||
        !isCloudFrontMediaUrl(originalSrc)
      ) {
        onError?.(event);
        return;
      }

      retriedSrcRef.current = originalSrc;
      const refreshed = await refreshCloudFrontCookiesOnce();
      if (!refreshed) {
        onError?.(event);
        return;
      }

      setImageSrc(withCloudFrontCacheBuster(originalSrc));
    },
    [onError, src],
  );

  return { src: imageSrc, onError: handleError };
}
