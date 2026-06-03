import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import type { TRumConfig, TUser } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { normalizeRumPath } from './routes';

const PROXY_API_KEY = 'librechat-rum-proxy';

let rumProxyToken: string | undefined;
let rumProxyFetchPatched = false;

type HyperDXBrowser = {
  init: (config: {
    advancedNetworkCapture: boolean;
    apiKey: string;
    consoleCapture: boolean;
    disableReplay: boolean;
    service: string;
    tracePropagationTargets?: string[];
    url: string;
  }) => void;
  setGlobalAttributes: (attributes: Record<string, string>) => void;
};

function shouldInitializeRum(config: TRumConfig | undefined, token: string | undefined): boolean {
  if (!config?.enabled || config.provider !== 'hyperdx' || !config.url || !config.serviceName) {
    return false;
  }

  if (config.authMode === 'publicToken') {
    return !!config.publicToken;
  }

  return config.authMode === 'proxy' && !!token && !config.publicToken;
}

function getApiKey(config: TRumConfig, token: string | undefined): string {
  if (config.authMode === 'proxy') {
    return token ? PROXY_API_KEY : '';
  }

  return config.publicToken ?? '';
}

function isRumProxyRequest(input: RequestInfo | URL, proxyUrl: string): boolean {
  const rawUrl =
    typeof Request !== 'undefined' && input instanceof Request ? input.url : input.toString();
  const url = new URL(rawUrl, window.location.origin);
  const proxy = new URL(proxyUrl, window.location.origin);

  return url.origin === window.location.origin && url.pathname.startsWith(`${proxy.pathname}/`);
}

function withAuthorization(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  token: string,
): [RequestInfo | URL, RequestInit | undefined] {
  const headers = new Headers(
    init?.headers ??
      (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined),
  );
  headers.set('authorization', `Bearer ${token}`);

  if (typeof Request !== 'undefined' && input instanceof Request) {
    return [new Request(input, { ...init, headers }), undefined];
  }

  return [input, { ...init, headers }];
}

function ensureRumProxyAuth(proxyUrl: string): void {
  if (rumProxyFetchPatched || typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (rumProxyToken && isRumProxyRequest(input, proxyUrl)) {
      const [authorizedInput, authorizedInit] = withAuthorization(input, init, rumProxyToken);
      return originalFetch(authorizedInput, authorizedInit);
    }

    return originalFetch(input, init);
  };
  rumProxyFetchPatched = true;
}

function buildGlobalAttributes(
  user: TUser | undefined,
  config: TRumConfig,
  route: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      route,
      role: user?.role,
      userId: user?.id,
      orgId: user?.tenantId,
      serviceName: config.serviceName,
      environment: config.environment,
    }).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
    ),
  );
}

async function loadHyperDX(): Promise<HyperDXBrowser> {
  const module = await import('@hyperdx/browser');
  return module.default;
}

export default function useRum(): void {
  const { data: startupConfig } = useGetStartupConfig();
  const { token, user } = useAuthContext();
  const location = useLocation();
  const initializedKeyRef = useRef<string | undefined>(undefined);
  const sampledInitKeyRef = useRef<string | undefined>(undefined);
  const sampledInRef = useRef<boolean>(true);
  const hyperDxRef = useRef<HyperDXBrowser | undefined>(undefined);
  const rumConfig = startupConfig?.rum;
  const route = useMemo(() => normalizeRumPath(location.pathname), [location.pathname]);
  const routeRef = useRef<string>(route);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    if (!rumConfig) {
      return;
    }

    if (!shouldInitializeRum(rumConfig, token)) {
      if (rumConfig?.authMode === 'proxy') {
        rumProxyToken = undefined;
      }
      return;
    }

    const config = rumConfig;
    const apiKey = getApiKey(config, token);
    if (config.authMode === 'proxy') {
      rumProxyToken = token;
      ensureRumProxyAuth(config.url);
    }

    const initKey = [config.url, config.serviceName, config.authMode, apiKey].join(':');

    if (initializedKeyRef.current === initKey) {
      return;
    }

    if (sampledInitKeyRef.current !== initKey) {
      sampledInitKeyRef.current = initKey;
      sampledInRef.current =
        typeof config.sampleRate === 'number' ? Math.random() < config.sampleRate : true;
    }

    if (!sampledInRef.current) {
      return;
    }

    let cancelled = false;

    loadHyperDX()
      .then((HyperDX) => {
        if (cancelled || initializedKeyRef.current === initKey) {
          return;
        }

        HyperDX.init({
          advancedNetworkCapture: config.advancedNetworkCapture ?? false,
          apiKey,
          consoleCapture: config.consoleCapture ?? false,
          disableReplay: config.disableReplay ?? true,
          service: config.serviceName,
          tracePropagationTargets: config.tracePropagationTargets,
          url: config.url,
        });

        hyperDxRef.current = HyperDX;
        initializedKeyRef.current = initKey;
        HyperDX.setGlobalAttributes(buildGlobalAttributes(user, config, routeRef.current));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [rumConfig, token, user]);

  useEffect(() => {
    hyperDxRef.current?.setGlobalAttributes(
      rumConfig ? buildGlobalAttributes(user, rumConfig, route) : { route },
    );
  }, [route, rumConfig, user]);
}
