import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import {
  isCloudFrontMediaUrl,
  useCloudFrontImageRetry,
  refreshCloudFrontCookiesOnce,
  configureCloudFrontCookieRefresh,
} from './cloudfront';

type FetchResponse = {
  ok: boolean;
  json: () => Promise<{ ok: boolean }>;
};

const cloudFrontStartupConfig = {
  cloudFront: {
    cookieRefresh: {
      endpoint: '/api/auth/cloudfront/refresh',
      domain: 'https://cdn.example.com',
    },
  },
};

function okResponse(): FetchResponse {
  return {
    ok: true,
    json: async () => ({ ok: true }),
  };
}

function TestImage({
  src,
  onFailure,
}: {
  src: string;
  onFailure: React.ReactEventHandler<HTMLImageElement>;
}) {
  const retry = useCloudFrontImageRetry(src, onFailure);
  return <img alt="media" src={retry.src} onError={retry.onError} />;
}

describe('CloudFront cookie refresh helpers', () => {
  let fetchMock: jest.Mock<Promise<FetchResponse>, Parameters<typeof fetch>>;

  beforeEach(() => {
    fetchMock = jest.fn<Promise<FetchResponse>, Parameters<typeof fetch>>();
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
    configureCloudFrontCookieRefresh(undefined);
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('no-ops when startup config has no CloudFront refresh capability', async () => {
    configureCloudFrontCookieRefresh({});

    await expect(refreshCloudFrontCookiesOnce()).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dedupes concurrent refresh calls', async () => {
    let resolveFetch: ((value: FetchResponse) => void) | undefined;
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    configureCloudFrontCookieRefresh(cloudFrontStartupConfig);

    const first = refreshCloudFrontCookiesOnce();
    const second = refreshCloudFrontCookiesOnce();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch?.(okResponse());
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

  it('retries a configured CloudFront image only once', async () => {
    fetchMock.mockResolvedValue(okResponse());
    configureCloudFrontCookieRefresh(cloudFrontStartupConfig);
    const onFailure = jest.fn();

    render(
      <TestImage src="https://cdn.example.com/i/images/user/file.png" onFailure={onFailure} />,
    );

    fireEvent.error(screen.getByAltText('media'));

    await waitFor(() =>
      expect(screen.getByAltText('media')).toHaveAttribute(
        'src',
        'https://cdn.example.com/i/images/user/file.png?_cf_refresh=1700000000000',
      ),
    );

    fireEvent.error(screen.getByAltText('media'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('does not retry arbitrary external images', () => {
    fetchMock.mockResolvedValue(okResponse());
    configureCloudFrontCookieRefresh(cloudFrontStartupConfig);
    const onFailure = jest.fn();

    render(<TestImage src="https://example.com/photo.png" onFailure={onFailure} />);

    fireEvent.error(screen.getByAltText('media'));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});
