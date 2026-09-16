import { z } from 'zod';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import type { Readable } from 'node:stream';
import { applySSRFSafeAgentIfDirect } from '../auth/agent';
import { MediaProviderError } from './errors';

export interface MediaTransportRequest {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string | FormData;
  signal?: AbortSignal;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects?: number;
}

export interface MediaTransport {
  json<T>(request: MediaTransportRequest, schema: z.ZodType<T>): Promise<T>;
  stream(request: MediaTransportRequest): Promise<Readable>;
}

export function createMediaTransport({
  http,
  allowedAddresses,
}: {
  http: AxiosInstance;
  allowedAddresses?: string[];
}): MediaTransport {
  const options = (request: MediaTransportRequest): AxiosRequestConfig =>
    applySSRFSafeAgentIfDirect(
      {
        url: request.url,
        method: request.method ?? 'GET',
        headers: request.headers,
        data: request.body,
        signal: request.signal,
        timeout: request.timeoutMs,
        maxContentLength: request.maxBytes,
        maxBodyLength: request.maxBytes,
        validateStatus: () => true,
      },
      request.url,
      allowedAddresses,
    );

  const assertStatus = (status: number) => {
    if (status >= 200 && status < 300) {
      return;
    }
    const rejected = status >= 400 && status < 500 && status !== 408;
    throw new MediaProviderError(rejected ? 'rejected' : 'uncertain', status);
  };

  return {
    async json<T>(request: MediaTransportRequest, schema: z.ZodType<T>): Promise<T> {
      try {
        const response = await http.request<string>({
          ...options(request),
          responseType: 'text',
          transformResponse: [(text: string) => text],
        });
        assertStatus(response.status);
        return schema.parse(JSON.parse(response.data));
      } catch (error) {
        if (error instanceof MediaProviderError) {
          throw error;
        }
        throw new MediaProviderError('uncertain');
      }
    },
    async stream(request: MediaTransportRequest): Promise<Readable> {
      try {
        let current = request;
        let response = await http.request<Readable>({
          ...options(current),
          responseType: 'stream',
        });
        for (let redirects = 0; [301, 302, 303, 307, 308].includes(response.status); redirects++) {
          response.data.destroy();
          if (
            redirects >= (request.maxRedirects ?? 0) ||
            typeof response.headers.location !== 'string'
          ) {
            throw new MediaProviderError('uncertain');
          }
          const target = new URL(response.headers.location, current.url);
          const previous = new URL(current.url);
          if (previous.protocol === 'https:' && target.protocol !== 'https:') {
            throw new MediaProviderError('rejected');
          }
          current = {
            ...current,
            url: target.href,
            headers: target.origin === previous.origin ? current.headers : {},
          };
          response = await http.request<Readable>({ ...options(current), responseType: 'stream' });
        }
        if (response.status < 200 || response.status >= 300) {
          response.data.destroy();
          assertStatus(response.status);
        }
        const size = Number(response.headers['content-length']);
        if (Number.isFinite(size) && size > request.maxBytes) {
          response.data.destroy();
          throw new MediaProviderError('rejected');
        }
        return response.data;
      } catch (error) {
        if (error instanceof MediaProviderError) {
          throw error;
        }
        throw new MediaProviderError('uncertain');
      }
    },
  };
}
