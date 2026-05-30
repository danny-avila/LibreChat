type TokenProvider = () => string | undefined;

type RumInterceptorConfig = {
  url?: string;
  tokenProvider?: TokenProvider;
  authHeaderScheme?: 'Bearer' | 'Basic';
};

declare global {
  interface Window {
    __libreChatRumInterceptor?: {
      configure: (config: RumInterceptorConfig) => void;
      clear: () => void;
    };
  }
}

let rumUrl: URL | undefined;
let tokenProvider: TokenProvider | undefined;
let authHeaderScheme: 'Bearer' | 'Basic' = 'Bearer';

const originalFetch = window.fetch.bind(window);
const OriginalXMLHttpRequest = window.XMLHttpRequest;

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== 'undefined' && input instanceof Request;
}

function parseUrl(value: string | URL): URL | undefined {
  try {
    return value instanceof URL ? value : new URL(value, window.location.origin);
  } catch {
    return undefined;
  }
}

function matchesRumUrl(value: string | URL): boolean {
  if (!rumUrl) {
    return false;
  }

  const requestUrl = parseUrl(value);
  if (!requestUrl || requestUrl.origin !== rumUrl.origin) {
    return false;
  }

  const basePath = rumUrl.pathname.endsWith('/') ? rumUrl.pathname : `${rumUrl.pathname}/`;
  return requestUrl.pathname === rumUrl.pathname || requestUrl.pathname.startsWith(basePath);
}

function getAuthorization(): string | undefined {
  const token = tokenProvider?.();
  return token ? `${authHeaderScheme} ${token}` : undefined;
}

const interceptedFetch = function interceptedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const requestUrl = isRequest(input) ? input.url : input;

  if (!matchesRumUrl(requestUrl)) {
    return originalFetch(input, init);
  }

  const authorization = getAuthorization();
  if (!authorization) {
    return originalFetch(input, init);
  }

  const headers = new Headers(isRequest(input) ? input.headers : init?.headers);
  headers.set('authorization', authorization);

  return originalFetch(input, {
    ...init,
    headers,
  });
};

window.fetch = Object.assign(interceptedFetch, window.fetch);

function InterceptedXMLHttpRequest(): XMLHttpRequest {
  const xhr = new OriginalXMLHttpRequest();
  const originalOpen = xhr.open;
  const originalSend = xhr.send;
  const originalSetRequestHeader = xhr.setRequestHeader;
  let isRumRequest = false;
  let rumSdkAuthorization: string | undefined;

  xhr.open = function open(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    isRumRequest = matchesRumUrl(url);

    if (arguments.length >= 5) {
      originalOpen.call(
        this,
        method,
        url,
        async ?? true,
        username ?? undefined,
        password ?? undefined,
      );
      return;
    }

    if (arguments.length === 4) {
      originalOpen.call(this, method, url, async ?? true, username ?? undefined);
      return;
    }

    if (arguments.length === 3) {
      originalOpen.call(this, method, url, async ?? true);
      return;
    }

    originalOpen.call(this, method, url);
  };

  xhr.setRequestHeader = function setRequestHeader(name: string, value: string): void {
    if (isRumRequest && name.toLowerCase() === 'authorization') {
      // HyperDX sets its own API key header; userJwt mode replaces it with the LibreChat auth token.
      rumSdkAuthorization = value;
      return;
    }

    originalSetRequestHeader.call(this, name, value);
  };

  xhr.send = function send(body?: Document | XMLHttpRequestBodyInit | null): void {
    const authorization = isRumRequest ? (getAuthorization() ?? rumSdkAuthorization) : undefined;
    if (authorization) {
      originalSetRequestHeader.call(this, 'authorization', authorization);
    }

    originalSend.call(this, body);
  };

  return xhr;
}

Object.setPrototypeOf(InterceptedXMLHttpRequest, OriginalXMLHttpRequest);
InterceptedXMLHttpRequest.prototype = OriginalXMLHttpRequest.prototype;
window.XMLHttpRequest = InterceptedXMLHttpRequest as unknown as typeof XMLHttpRequest;

window.__libreChatRumInterceptor = {
  configure(config: RumInterceptorConfig) {
    rumUrl = config.url ? parseUrl(config.url) : undefined;
    tokenProvider = config.tokenProvider;
    authHeaderScheme = config.authHeaderScheme ?? 'Bearer';
  },
  clear() {
    rumUrl = undefined;
    tokenProvider = undefined;
    authHeaderScheme = 'Bearer';
  },
};

export {};
