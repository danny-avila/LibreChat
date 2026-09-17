import { z } from 'zod';
import { isAxiosError } from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosRequestHeaders } from 'axios';
import type { Readable } from 'node:stream';
import { applySSRFSafeAgentIfDirect } from '../auth/agent';
import { MediaProviderError } from './errors';
import { isSSRFTarget } from '../auth/domain';

export interface MediaTransportRequest {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string | FormData;
  signal?: AbortSignal;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects?: number;
  emptyResponse?: { status: number; body: string };
  publicOnly?: boolean;
}

export interface MediaTransport {
  json<T>(request: MediaTransportRequest, schema: z.ZodType<T>): Promise<T>;
  stream(request: MediaTransportRequest): Promise<Readable>;
}

export function isMediaTransferLimitError(error: Error, maxBytes: number): boolean {
  return (
    (error instanceof MediaProviderError && error.status === 413) ||
    (isAxiosError(error) &&
      error.code === 'ERR_BAD_RESPONSE' &&
      error.message === `maxContentLength size of ${maxBytes} exceeded`)
  );
}

/** Axios merges instance defaults before transforms, so an empty request header map is insufficient. */
function preparePublicRequest(
  this: AxiosRequestConfig,
  data: string | FormData | undefined,
  headers: AxiosRequestHeaders,
): string | FormData | undefined {
  headers.clear();
  this.auth = undefined;
  this.params = undefined;
  this.socketPath = undefined;
  this.transport = undefined;
  return data;
}

export function createMediaTransport({
  http,
  allowedAddresses,
}: {
  http: AxiosInstance;
  allowedAddresses?: string[];
}): MediaTransport {
  const options = (request: MediaTransportRequest): AxiosRequestConfig => {
    if (request.publicOnly) {
      const target = new URL(request.url);
      if (
        target.protocol !== 'https:' ||
        target.username ||
        target.password ||
        target.hash ||
        isSSRFTarget(target.hostname)
      )
        throw new MediaProviderError('rejected');
    }
    return applySSRFSafeAgentIfDirect(
      {
        url: request.url,
        method: request.method ?? 'GET',
        headers: request.publicOnly ? {} : request.headers,
        data: request.body,
        signal: request.signal,
        timeout: request.timeoutMs,
        maxContentLength: request.maxBytes,
        maxBodyLength: request.maxBytes,
        validateStatus: () => true,
        ...(request.publicOnly
          ? {
              proxy: false,
              allowAbsoluteUrls: true,
              httpVersion: 1,
              withCredentials: false,
              withXSRFToken: false,
              transformRequest: [preparePublicRequest],
            }
          : {}),
      },
      request.url,
      request.publicOnly ? undefined : allowedAddresses,
    );
  };

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
        const body =
          response.status === request.emptyResponse?.status && !response.data.trim()
            ? request.emptyResponse.body
            : response.data;
        return schema.parse(JSON.parse(body));
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
          throw new MediaProviderError('rejected', 413);
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
