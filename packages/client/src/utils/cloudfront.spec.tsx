import { fireEvent, waitFor } from '@testing-library/react';

const mockRequestPost = jest.fn();

jest.mock('librechat-data-provider', () => ({
  request: {
    post: (...args: unknown[]) => mockRequestPost(...args),
  },
}));

import {
  isCloudFrontMediaUrl,
  refreshCloudFrontCookiesOnce,
  installCloudFrontImageRetry,
  configureCloudFrontCookieRefresh,
} from './cloudfront';

const cloudFrontStartupConfig = {
  cloudFront: {
    cookieRefresh: {
      endpoint: '/api/auth/cloudfront/refresh',
      domain: 'https://cdn.example.com',
    },
  },
};

describe('CloudFront cookie refresh helpers', () => {
  beforeEach(() => {
    mockRequestPost.mockReset();
    configureCloudFrontCookieRefresh(undefined);
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('no-ops when startup config has no CloudFront refresh capability', async () => {
    configureCloudFrontCookieRefresh({});

    await expect(refreshCloudFrontCookiesOnce()).resolves.toBe(false);

    expect(mockRequestPost).not.toHaveBeenCalled();
  });

  it('dedupes concurrent refresh calls', async () => {
    let resolveRefresh: ((value: { ok: boolean }) => void) | undefined;
    mockRequestPost.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    configureCloudFrontCookieRefresh(cloudFrontStartupConfig);

    const first = refreshCloudFrontCookiesOnce();
    const second = refreshCloudFrontCookiesOnce();

    expect(mockRequestPost).toHaveBeenCalledTimes(1);
    expect(mockRequestPost).toHaveBeenCalledWith('/api/auth/cloudfront/refresh', {});
    resolveRefresh?.({ ok: true });
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it('detects only the configured CloudFront domain', () => {
    expect(
      isCloudFrontMediaUrl(
        'https://cdn.example.com/i/images/user/file.png',
        cloudFrontStartupConfig,
      ),
    ).toBe(true);
    expect(
      isCloudFrontMediaUrl(
        'https://images.example.net/i/images/user/file.png',
        cloudFrontStartupConfig,
      ),
    ).toBe(false);
  });

  it('retries a configured CloudFront image only once from the global listener', async () => {
    mockRequestPost.mockResolvedValue({ ok: true });
    const cleanup = installCloudFrontImageRetry(cloudFrontStartupConfig);
    const img = document.createElement('img');
    const onFailure = jest.fn();
    img.src = 'https://cdn.example.com/i/images/user/file.png';
    img.addEventListener('error', onFailure);
    document.body.appendChild(img);

    fireEvent.error(img);

    await waitFor(() =>
      expect(img).toHaveAttribute(
        'src',
        'https://cdn.example.com/i/images/user/file.png?_cf_refresh=1700000000000',
      ),
    );

    fireEvent.error(img);

    expect(mockRequestPost).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledTimes(1);

    cleanup();
    img.remove();
  });

  it('does not retry arbitrary external images', () => {
    mockRequestPost.mockResolvedValue({ ok: true });
    const cleanup = installCloudFrontImageRetry(cloudFrontStartupConfig);
    const img = document.createElement('img');
    const onFailure = jest.fn();
    img.src = 'https://example.com/photo.png';
    img.addEventListener('error', onFailure);
    document.body.appendChild(img);

    fireEvent.error(img);

    expect(mockRequestPost).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledTimes(1);

    cleanup();
    img.remove();
  });
});
