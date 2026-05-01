/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { setTokenHeader } from './headers-helpers';
import * as endpoints from './api-endpoints';
import type * as t from './types';

async function _get<T>(url: string, options?: AxiosRequestConfig): Promise<T> {
  const response = await axios.get(url, { ...options });
  return response.data;
}

async function _getResponse<T>(url: string, options?: AxiosRequestConfig): Promise<T> {
  return await axios.get(url, { ...options });
}

async function _post(url: string, data?: any) {
  const response = await axios.post(url, JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
  return response.data;
}

async function _postMultiPart(url: string, formData: FormData, options?: AxiosRequestConfig) {
  const response = await axios.post(url, formData, {
    ...options,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

async function _postTTS(url: string, formData: FormData, options?: AxiosRequestConfig) {
  const response = await axios.post(url, formData, {
    ...options,
    headers: { 'Content-Type': 'multipart/form-data' },
    responseType: 'arraybuffer',
  });
  return response.data;
}

async function _put(url: string, data?: any) {
  const response = await axios.put(url, JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
  return response.data;
}

async function _delete<T>(url: string): Promise<T> {
  const response = await axios.delete(url);
  return response.data;
}

async function _deleteWithOptions<T>(url: string, options?: AxiosRequestConfig): Promise<T> {
  const response = await axios.delete(url, { ...options });
  return response.data;
}

async function _patch(url: string, data?: any) {
  const response = await axios.patch(url, JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
  return response.data;
}

let isRefreshing = false;
let failedQueue: { resolve: (value?: any) => void; reject: (reason?: any) => void }[] = [];

const refreshToken = (retry?: boolean): Promise<t.TRefreshTokenResponse | undefined> =>
  _post(endpoints.refreshToken(retry));

const stripBasePath = (pathname: string) => {
  const baseUrl = endpoints.apiBaseUrl();
  if (baseUrl && (pathname === baseUrl || pathname.startsWith(`${baseUrl}/`))) {
    return pathname.slice(baseUrl.length) || '/';
  }
  return pathname;
};

const isSharePage = () =>
  /(?:^|\/)share\/[^/]+\/?$/.test(stripBasePath(window.location.pathname));

const getRequestPathname = (url?: string) => {
  if (typeof url !== 'string') {
    return '';
  }
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url.split(/[?#]/)[0] ?? '';
  }
};

const isSharedMessagesRequest = (url?: string, method?: string) =>
  method?.toLowerCase() === 'get' &&
  /(?:^|\/)api\/share\/[^/]+$/.test(getRequestPathname(url));

const dispatchTokenUpdatedEvent = (token: string) => {
  setTokenHeader(token);
  window.dispatchEvent(new CustomEvent('tokenUpdated', { detail: token }));
};

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

if (typeof window !== 'undefined') {
  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;
      if (!error.response) {
        return Promise.reject(error);
      }

      if (originalRequest.url?.includes('/api/auth/2fa') === true) {
        return Promise.reject(error);
      }
      if (originalRequest.url?.includes('/api/auth/logout') === true) {
        return Promise.reject(error);
      }

      /** Skip refresh when the Authorization header has been cleared (e.g. during logout),
       *  but allow the shared link data request to proceed so private shares can still
       *  recover auth/redirect without unrelated share-page queries forcing login. */
      if (
        !axios.defaults.headers.common['Authorization'] &&
        !(isSharePage() && isSharedMessagesRequest(originalRequest.url, originalRequest.method))
      ) {
        return Promise.reject(error);
      }

      if (error.response.status === 401 && !originalRequest._retry) {
        console.warn('401 error, refreshing token');
        originalRequest._retry = true;

        if (isRefreshing) {
          try {
            const token = await new Promise((resolve, reject) => {
              failedQueue.push({ resolve, reject });
            });
            originalRequest.headers['Authorization'] = 'Bearer ' + token;
            return await axios(originalRequest);
          } catch (err) {
            return Promise.reject(err);
          }
        }

        isRefreshing = true;

        try {
          const response = await refreshToken(
            // Handle edge case where we get a blank screen if the initial 401 error is from a refresh token request
            originalRequest.url?.includes('api/auth/refresh') === true ? true : false,
          );

          const token = response?.token ?? '';

          if (token) {
            originalRequest.headers['Authorization'] = 'Bearer ' + token;
            dispatchTokenUpdatedEvent(token);
            processQueue(null, token);
            return await axios(originalRequest);
          } else {
            processQueue(error, null);
            window.location.href = endpoints.apiBaseUrl() + endpoints.buildLoginRedirectUrl();
          }
        } catch (err) {
          processQueue(err as AxiosError, null);
          return Promise.reject(err);
        } finally {
          isRefreshing = false;
        }
      }

      return Promise.reject(error);
    },
  );
}

export default {
  get: _get,
  getResponse: _getResponse,
  post: _post,
  postMultiPart: _postMultiPart,
  postTTS: _postTTS,
  put: _put,
  delete: _delete,
  deleteWithOptions: _deleteWithOptions,
  patch: _patch,
  refreshToken,
  dispatchTokenUpdatedEvent,
};
