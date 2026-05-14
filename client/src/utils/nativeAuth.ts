import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import {
  readNativeRefreshToken,
  writeNativeRefreshToken,
  clearNativeRefreshToken,
} from './nativeTokenStore';

const NATIVE_CALLBACK_PATH = '/oauth/callback';

const NATIVE_REFRESH_AUGMENT_PATHS = ['/api/auth/refresh'];
const NATIVE_REFRESH_PERSIST_PATHS = [
  '/api/auth/refresh',
  '/api/auth/oauth/exchange',
  '/api/auth/apple/native',
];
const NATIVE_REFRESH_CLEAR_PATHS = ['/api/auth/logout'];

let interceptorsInstalled = false;
let appUrlListenerInstalled = false;
let pendingDeepLinkResolver: ((url: string) => void) | null = null;
let pendingDeepLinkRejecter: ((err: Error) => void) | null = null;

export const isNativePlatform = () => Capacitor.isNativePlatform?.() ?? false;
export const getNativePlatformName = () => Capacitor.getPlatform?.() ?? 'web';

const getApiBaseUrl = () =>
  (typeof window !== 'undefined' && (window as any).__LIBRECHAT_API_BASE_URL__) || '';

const matchesPath = (url: string | undefined, candidates: string[]) => {
  if (!url) {
    return false;
  }
  try {
    const path = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0];
    return candidates.some((candidate) => path.endsWith(candidate));
  } catch {
    return false;
  }
};

const installAxiosInterceptors = () => {
  if (interceptorsInstalled || !isNativePlatform()) {
    return;
  }
  interceptorsInstalled = true;

  axios.interceptors.request.use(async (config) => {
    if (
      matchesPath(config.url, NATIVE_REFRESH_AUGMENT_PATHS) &&
      (config.method ?? 'post').toLowerCase() === 'post'
    ) {
      const token = await readNativeRefreshToken();
      if (token) {
        let body: Record<string, unknown> = {};
        if (typeof config.data === 'string' && config.data.length > 0) {
          try {
            body = JSON.parse(config.data);
          } catch {
            body = {};
          }
        } else if (config.data && typeof config.data === 'object') {
          body = config.data as Record<string, unknown>;
        }
        body = { ...body, refreshToken: token };
        config.data = JSON.stringify(body);
        config.headers = config.headers ?? {};
        (config.headers as Record<string, string>)['Content-Type'] = 'application/json';
      }
    }
    return config;
  });

  axios.interceptors.response.use(async (response) => {
    if (matchesPath(response.config?.url, NATIVE_REFRESH_PERSIST_PATHS)) {
      const newRefresh = response.data?.refreshToken;
      if (typeof newRefresh === 'string' && newRefresh) {
        await writeNativeRefreshToken(newRefresh);
      }
    }
    if (matchesPath(response.config?.url, NATIVE_REFRESH_CLEAR_PATHS)) {
      await clearNativeRefreshToken();
    }
    return response;
  });
};

const installAppUrlListener = async () => {
  if (appUrlListenerInstalled || !isNativePlatform()) {
    return;
  }
  appUrlListenerInstalled = true;
  const { App } = await import('@capacitor/app');
  App.addListener('appUrlOpen', ({ url }) => {
    if (!url || !url.includes(NATIVE_CALLBACK_PATH)) {
      return;
    }
    if (pendingDeepLinkResolver) {
      const resolve = pendingDeepLinkResolver;
      pendingDeepLinkResolver = null;
      pendingDeepLinkRejecter = null;
      resolve(url);
    }
  });
};

const awaitDeepLink = (timeoutMs = 5 * 60 * 1000): Promise<string> =>
  new Promise((resolve, reject) => {
    if (pendingDeepLinkResolver) {
      pendingDeepLinkRejecter?.(new Error('Superseded by a new sign-in attempt'));
    }
    pendingDeepLinkResolver = resolve;
    pendingDeepLinkRejecter = reject;
    setTimeout(() => {
      if (pendingDeepLinkResolver === resolve) {
        pendingDeepLinkResolver = null;
        pendingDeepLinkRejecter = null;
        reject(new Error('Sign-in timed out'));
      }
    }, timeoutMs);
  });

const persistSessionForBootstrap = (token: string, user: unknown) => {
  try {
    sessionStorage.setItem('registrationAuth', JSON.stringify({ token, user }));
  } catch (err) {
    console.warn('[nativeAuth] failed to stash session for bootstrap', err);
  }
};

const finalizeSession = ({
  token,
  refreshToken,
  user,
}: {
  token: string;
  refreshToken?: string | null;
  user: unknown;
}) => {
  if (refreshToken) {
    void writeNativeRefreshToken(refreshToken);
  }
  persistSessionForBootstrap(token, user);
  // After the full reload AuthContext re-mounts, reads `registrationAuth`
  // from sessionStorage and calls setUserContext({ isAuthenticated: true }),
  // which sets the first-visit flag in one place.
  window.location.href = '/c/new';
};

/**
 * Open a server-side OAuth flow (Google, GitHub, etc.) in the system browser
 * via SFSafariViewController. The server redirects to ai.codecan.app://oauth/callback
 * with a one-time exchange code, which we trade for tokens.
 */
export const signInWithBrowser = async (oauthPath: string): Promise<void> => {
  if (!isNativePlatform()) {
    throw new Error('signInWithBrowser is native-only');
  }
  await installAppUrlListener();

  const apiBase = getApiBaseUrl();
  if (!apiBase) {
    throw new Error('API base URL is not configured');
  }

  const platform = getNativePlatformName();
  const url = `${apiBase.replace(/\/$/, '')}/oauth/${oauthPath}?platform=${encodeURIComponent(platform)}`;

  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url, presentationStyle: 'popover' });

  let callbackUrl: string;
  try {
    callbackUrl = await awaitDeepLink();
  } finally {
    await Browser.close().catch(() => {});
  }

  const parsed = new URL(callbackUrl);
  const error = parsed.searchParams.get('error');
  if (error) {
    throw new Error(error);
  }
  const code = parsed.searchParams.get('code');
  if (!code) {
    throw new Error('Missing exchange code in callback URL');
  }

  const response = await axios.post(`${apiBase.replace(/\/$/, '')}/api/auth/oauth/exchange`, {
    code,
  });
  const { token, refreshToken, user } = response.data ?? {};
  if (!token || !user) {
    throw new Error('Exchange response missing token or user');
  }
  finalizeSession({ token, refreshToken, user });
};

/**
 * Native ASAuthorization-based Sign in with Apple via the Capacitor plugin,
 * with a server-side identity-token verification step. Reuses the existing
 * `apple` provider record so the user lands on the same account whether
 * they signed in through the web flow or the native flow.
 */
export const signInWithAppleNative = async (): Promise<void> => {
  if (!isNativePlatform()) {
    throw new Error('signInWithAppleNative is native-only');
  }

  const apiBase = getApiBaseUrl();
  if (!apiBase) {
    throw new Error('API base URL is not configured');
  }

  const nonce = generateNonce();
  const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
  const result = await SignInWithApple.authorize({
    clientId: 'ai.codecan.app',
    redirectURI: `${apiBase.replace(/\/$/, '')}/oauth/apple/callback`,
    scopes: 'email name',
    nonce,
  });

  const identityToken = result.response?.identityToken;
  if (!identityToken) {
    throw new Error('Apple returned no identity token');
  }

  const body: Record<string, unknown> = { identityToken, nonce };
  if (result.response?.givenName || result.response?.familyName) {
    body.fullName = {
      givenName: result.response.givenName,
      familyName: result.response.familyName,
    };
  }

  const response = await axios.post(`${apiBase.replace(/\/$/, '')}/api/auth/apple/native`, body);
  const { token, refreshToken, user } = response.data ?? {};
  if (!token || !user) {
    throw new Error('Apple native response missing token or user');
  }
  finalizeSession({ token, refreshToken, user });
};

/**
 * Generates a URL-safe nonce. Apple hashes this with SHA-256 and includes
 * the hash in the identity token under `nonce`. Our server verifies the
 * supplied value matches.
 */
const generateNonce = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
};

/**
 * Bootstrap native auth wiring: axios interceptors for body-based refresh
 * tokens and the deep-link listener. Safe to call multiple times; safe to
 * call on web (no-ops). Must be called before any API request happens.
 */
export const installNativeAuthBootstrap = () => {
  if (!isNativePlatform()) {
    return;
  }
  installAxiosInterceptors();
  void installAppUrlListener();
};

export const clearNativeAuth = async () => {
  await clearNativeRefreshToken();
};
