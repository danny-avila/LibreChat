import { requestAccessToken } from './session';
import { parseJson } from './json';

export interface ApiError {
  status: number;
  message: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export type RemoteState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'failed'; error: ApiError };

export interface ApiClient {
  get: <TResponse>(path: string) => Promise<ApiResult<TResponse>>;
  post: <TResponse, TBody>(path: string, body: TBody) => Promise<ApiResult<TResponse>>;
  put: <TResponse, TBody>(path: string, body: TBody) => Promise<ApiResult<TResponse>>;
  patch: <TResponse, TBody>(path: string, body: TBody) => Promise<ApiResult<TResponse>>;
  remove: <TResponse>(path: string) => Promise<ApiResult<TResponse>>;
}

interface ErrorBody {
  error?: string;
  message?: string;
}

/** No HTTP response reached us: the request never left, or the connection dropped. */
const NETWORK_STATUS = 0;

const MAX_ERROR_BODY_LENGTH = 300;

const toApiError = (status: number, statusText: string, body: string): ApiError => {
  const parsed = parseJson<ErrorBody>(body);
  const message = parsed?.error ?? parsed?.message ?? body.trim().slice(0, MAX_ERROR_BODY_LENGTH);
  return { status, message: message || statusText || 'The request failed.' };
};

export const describeError = (error: ApiError): string =>
  error.status > 0 ? `HTTP ${error.status} — ${error.message}` : error.message;

/**
 * Holds the access token it was constructed with and renews it once on a 401, because
 * LibreChat access tokens are short-lived while an admin sits on this screen.
 */
export const createApiClient = (initialToken: string): ApiClient => {
  let token = initialToken;

  const send = async <TResponse>(
    path: string,
    init: RequestInit,
    allowRetry: boolean,
  ): Promise<ApiResult<TResponse>> => {
    let response: Response;
    try {
      response = await fetch(path, {
        ...init,
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init.body == null ? {} : { 'Content-Type': 'application/json' }),
        },
      });
    } catch (error) {
      return {
        ok: false,
        error: {
          status: NETWORK_STATUS,
          message:
            error instanceof Error ? error.message : 'The request could not reach the server.',
        },
      };
    }

    if (response.status === 401 && allowRetry) {
      const refreshed = await requestAccessToken();
      if (refreshed.ok) {
        token = refreshed.token;
        return send<TResponse>(path, init, false);
      }
    }

    const body = await response.text();
    if (!response.ok) {
      return { ok: false, error: toApiError(response.status, response.statusText, body) };
    }

    const data = parseJson<TResponse>(body);
    if (!data) {
      return {
        ok: false,
        error: {
          status: response.status,
          message: 'The server answered with a body that was not a JSON object.',
        },
      };
    }
    return { ok: true, data };
  };

  return {
    get: <TResponse>(path: string) => send<TResponse>(path, { method: 'GET' }, true),
    post: <TResponse, TBody>(path: string, body: TBody) =>
      send<TResponse>(path, { method: 'POST', body: JSON.stringify(body) }, true),
    put: <TResponse, TBody>(path: string, body: TBody) =>
      send<TResponse>(path, { method: 'PUT', body: JSON.stringify(body) }, true),
    patch: <TResponse, TBody>(path: string, body: TBody) =>
      send<TResponse>(path, { method: 'PATCH', body: JSON.stringify(body) }, true),
    remove: <TResponse>(path: string) => send<TResponse>(path, { method: 'DELETE' }, true),
  };
};
