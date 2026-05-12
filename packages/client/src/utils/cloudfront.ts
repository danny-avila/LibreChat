import { request, type TStartupConfig } from 'librechat-data-provider';

type CloudFrontCookieRefreshConfig = NonNullable<
  NonNullable<TStartupConfig['cloudFront']>['cookieRefresh']
>;

let cookieRefreshConfig: CloudFrontCookieRefreshConfig | undefined;
let refreshPromise: Promise<boolean> | null = null;
let removeImageErrorListener: (() => void) | null = null;
const retriedImageSources = new WeakMap<HTMLImageElement, string>();

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

function getRetryKey(url: string): string {
  const parsed = parseUrl(url);
  if (!parsed) {
    return url;
  }

  parsed.searchParams.delete('_cf_refresh');
  return parsed.toString();
}

function dispatchImageError(img: HTMLImageElement): void {
  img.dispatchEvent(new Event('error'));
}

export function refreshCloudFrontCookiesOnce(): Promise<boolean> {
  const config = getRefreshConfig();
  if (!config?.endpoint) {
    return Promise.resolve(false);
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = request
    .post(config.endpoint, {})
    .then((payload: { ok?: boolean }) => payload.ok === true)
    .catch(() => false)
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export function installCloudFrontImageRetry(
  startupConfig?: Pick<TStartupConfig, 'cloudFront'> | null,
): () => void {
  configureCloudFrontCookieRefresh(startupConfig);
  removeImageErrorListener?.();
  removeImageErrorListener = null;

  const config = getRefreshConfig();
  if (typeof window === 'undefined' || !config?.endpoint || !config.domain) {
    return () => undefined;
  }

  const handleImageError = (event: Event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) {
      return;
    }

    const failedSrc = img.currentSrc || img.src || img.getAttribute('src') || '';
    if (!isCloudFrontMediaUrl(failedSrc)) {
      return;
    }

    const retryKey = getRetryKey(failedSrc);
    if (retriedImageSources.get(img) === retryKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    retriedImageSources.set(img, retryKey);

    void refreshCloudFrontCookiesOnce().then((refreshed) => {
      if (!refreshed || !img.isConnected) {
        dispatchImageError(img);
        return;
      }

      img.src = withCloudFrontCacheBuster(failedSrc);
    });
  };

  window.addEventListener('error', handleImageError, true);
  const cleanup = () => {
    window.removeEventListener('error', handleImageError, true);
    if (removeImageErrorListener === cleanup) {
      removeImageErrorListener = null;
    }
  };
  removeImageErrorListener = cleanup;

  return cleanup;
}
