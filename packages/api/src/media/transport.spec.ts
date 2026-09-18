import { z } from 'zod';
import dns from 'node:dns';
import { Readable } from 'node:stream';
import axios, { AxiosError } from 'axios';
import type { CreateAxiosDefaults, InternalAxiosRequestConfig } from 'axios';
import { createMediaTransport } from './transport';

describe('public media downloads', () => {
  function fixture(defaults: CreateAxiosDefaults = {}) {
    const requests: InternalAxiosRequestConfig[] = [];
    const responses: Readable[] = [];
    let redirect: string | undefined;
    const http = axios.create({
      ...defaults,
      adapter: async (config) => {
        requests.push(config);
        const data = Readable.from([Buffer.from('reference')]);
        responses.push(data);
        const location = redirect;
        redirect = undefined;
        return {
          config,
          data,
          status: location ? 302 : 200,
          statusText: location ? 'Found' : 'OK',
          headers: location ? { location } : {},
        };
      },
    });
    return {
      requests,
      responses,
      transport: createMediaTransport({ http, allowedAddresses: ['127.0.0.1:443'] }),
      redirectTo: (url: string) => {
        redirect = url;
      },
    };
  }

  const request = {
    url: 'https://reference.example/video.mp4?signature=owned-reference',
    publicOnly: true,
    timeoutMs: 1000,
    maxBytes: 1024,
    maxRedirects: 2,
  };

  it('drops inherited headers, auth, query parameters and alternate routing on every redirect', async () => {
    const { transport, requests, responses, redirectTo } = fixture({
      headers: {
        common: {
          Authorization: 'Bearer fixture-only',
          Cookie: 'session=fixture-only',
          'X-Api-Key': 'fixture-only',
          'Proxy-Authorization': 'Basic fixture-only',
        },
      },
      auth: { username: 'fixture', password: 'fixture-only' },
      params: { api_key: 'fixture-only' },
      proxy: { host: 'proxy.example', port: 8080 },
      socketPath: 'fixture-only.sock',
      transport: {
        request: () => {
          throw new Error('Inherited transport must not run');
        },
      },
      baseURL: 'https://provider.example/v1',
      allowAbsoluteUrls: false,
      httpVersion: 2,
      withCredentials: true,
      withXSRFToken: true,
    });
    redirectTo('https://cdn.example/video.mp4?signature=redirect-reference');
    const stream = await transport.stream({
      ...request,
      headers: { Authorization: 'Bearer request-fixture-only' },
    });
    stream.destroy();
    expect(requests).toHaveLength(2);
    expect(requests.map((config) => config.url)).toEqual([
      request.url,
      'https://cdn.example/video.mp4?signature=redirect-reference',
    ]);
    for (const config of requests) {
      expect(config.headers.toJSON()).toEqual({});
      expect(config.auth).toBeUndefined();
      expect(config.params).toBeUndefined();
      expect(config.socketPath).toBeUndefined();
      expect(config.transport).toBeUndefined();
      expect(config.proxy).toBe(false);
      expect(config.allowAbsoluteUrls).toBe(true);
      expect(config.httpVersion).toBe(1);
      expect(config.withCredentials).toBe(false);
      expect(config.withXSRFToken).toBe(false);
      expect(config.maxRedirects).toBe(0);
      expect(config.httpAgent).toBeDefined();
      expect(config.httpsAgent).toBeDefined();
    }
    expect(responses.every((response) => response.destroyed)).toBe(true);
  });

  it('rejects private DNS answers at connection time despite provider address exemptions', async () => {
    const lookup = jest
      .spyOn(dns, 'lookup')
      .mockImplementation(((
        _hostname: string,
        _options: dns.LookupOptions,
        callback: (
          error: NodeJS.ErrnoException | null,
          address: dns.LookupAddress[],
          family?: number,
        ) => void,
      ) => callback(null, [{ address: '127.0.0.1', family: 4 }])) as typeof dns.lookup);
    const transport = createMediaTransport({
      http: axios.create(),
      allowedAddresses: ['reference.example:443', '127.0.0.1:443'],
    });
    await expect(transport.stream(request)).rejects.toMatchObject({ certainty: 'uncertain' });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup.mock.calls[0][0]).toBe('reference.example');
  });

  it.each([
    'https://127.0.0.1/private',
    'https://[::ffff:127.0.0.1]/private',
    'https://user:password@cdn.example/private',
    'https://cdn.example/private#fragment',
    'http://cdn.example/private',
  ])(
    'rejects an unsafe redirect even if the address is allowed for native providers: %s',
    async (url) => {
      const { transport, requests, responses, redirectTo } = fixture();
      redirectTo(url);
      await expect(transport.stream(request)).rejects.toMatchObject({ certainty: 'rejected' });
      expect(requests).toHaveLength(1);
      expect(responses[0].destroyed).toBe(true);
    },
  );

  it('records a redacted failure reason without copying response headers or bodies', async () => {
    const leaked = ['session=fixture-only-cookie', 'req-fixture-only', 'body-with-fixture-only'];
    const http = axios.create({
      adapter: async (config) => ({
        config,
        data: leaked[2],
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'set-cookie': [leaked[0]], 'x-request-id': leaked[1] },
      }),
    });
    const transport = createMediaTransport({ http, allowedAddresses: ['127.0.0.1:443'] });
    const error: unknown = await transport
      .json({ ...request, publicOnly: false }, z.object({}))
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ certainty: 'uncertain', status: 503, reason: 'http_503' });
    const reason = (error as { reason: string }).reason;
    for (const value of leaked) {
      expect(reason).not.toContain(value);
    }
  });

  it('names the transport error class when no response arrived', async () => {
    const http = axios.create({
      adapter: async (config) => {
        throw new AxiosError('timeout of 1000ms exceeded', AxiosError.ECONNABORTED, config);
      },
    });
    const transport = createMediaTransport({ http, allowedAddresses: ['127.0.0.1:443'] });
    await expect(
      transport.json({ ...request, publicOnly: false }, z.object({})),
    ).rejects.toMatchObject({ certainty: 'uncertain', reason: 'ECONNABORTED' });
    const { transport: redirecting, redirectTo } = fixture();
    redirectTo('https://cdn.example/video.mp4');
    await expect(redirecting.stream({ ...request, maxRedirects: 0 })).rejects.toMatchObject({
      certainty: 'uncertain',
      status: 302,
      reason: 'redirect_limit',
    });
  });

  it('preserves configured provider authentication outside public downloads', async () => {
    const { transport, requests } = fixture({
      headers: { common: { 'X-Api-Key': 'provider-fixture' } },
      auth: { username: 'provider', password: 'provider-fixture' },
    });
    const stream = await transport.stream({
      ...request,
      publicOnly: false,
      headers: { Authorization: 'Bearer provider-fixture' },
    });
    stream.destroy();
    expect(requests[0].headers.get('X-Api-Key')).toBe('provider-fixture');
    expect(requests[0].headers.get('Authorization')).toBe('Bearer provider-fixture');
    expect(requests[0].auth?.username).toBe('provider');
  });
});
