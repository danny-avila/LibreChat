import axios_ from 'axios';
import { VERA_HEADER } from '../../utils/constants';
import { Auth } from '../../types/auth';
//import secureLocalStorage from 'react-secure-storage';

export const BASE_API_URL = 'https://dev-app.askvera.io/api/v1'; // import.meta.env.VITE_VERA_API;
export const axios = axios_.create({
  baseURL: BASE_API_URL,
});

// export const appLocalStorage =
//   import.meta.env.MODE === 'development' ? localStorage : secureLocalStorage;

export const appLocalStorage = localStorage;

// Set the AUTH token for any request
axios.interceptors.request.use(function (config) {
  const auth: Auth | null = JSON.parse((appLocalStorage.getItem('auth') as string) ?? 'null');
  if (auth) config.headers[VERA_HEADER] = auth.access_token;
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    // if no response or status => network error => return original error
    if (!error.response || !error.response.status) {
      return Promise.reject(error);
    }
    const { status, config } = error.response;
    // Check if the request is for the login endpoint
    const isLoginRequest = config.url === 'login' && config.method === 'post';

    // if not auth related, return original error
    if (status !== 401 || isLoginRequest) {
      return Promise.reject(error);
    }

    // On auth errors, wipe session and go to login
    appLocalStorage.removeItem('auth');
    window.location.href = 'login';
    return Promise.reject(error);
  },
);
