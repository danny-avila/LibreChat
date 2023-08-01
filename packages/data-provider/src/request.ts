import axios, { AxiosRequestConfig, AxiosError } from 'axios';
import { refreshToken } from './data-service';
import { setTokenHeader } from './headers-helpers';

let isRefreshing = false;
let failedQueue: {resolve: (value?: any) => void, reject: (reason?: any) => void}[] = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const originalRequest = error.config;
    if (originalRequest.url.includes('/api/auth/refresh')) {
      window.dispatchEvent(new CustomEvent('logout'));
      return Promise.reject(error);
    }
    
    if (error.response.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise(function(resolve, reject) {
          failedQueue.push({resolve, reject});
        }).then(token => {
          originalRequest.headers['Authorization'] = 'Bearer ' + token;
          return axios(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      return new Promise(function(resolve, reject) {
        refreshToken()
          .then(({token}) => {
            originalRequest.headers['Authorization'] = 'Bearer ' + token;
            setTokenHeader(token);
            window.dispatchEvent(new CustomEvent('tokenUpdated', { detail: token }));
            processQueue(null, token);
            resolve(axios(originalRequest));
          })
          .catch((err) => {
            if (error.response.status === 401) {
              window.dispatchEvent(new CustomEvent('logout'));
            }
            processQueue(err, null);
            reject(err);
          })
          .then(() => {
            isRefreshing = false;
          });
      });
    }
    return Promise.reject(error);
  }
);

async function _get<T>(url: string, options?: AxiosRequestConfig): Promise<T> {
  const response = await axios.get(url, { ...options });
  return response.data;
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

export default {
  get: _get,
  post: _post,
  postMultiPart: _postMultiPart,
  put: _put,
  delete: _delete,
  deleteWithOptions: _deleteWithOptions,
  patch: _patch,
};
