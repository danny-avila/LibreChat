import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import type { TRumConfig, TUser } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { normalizeRumPath } from './routes';

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

  return !!token;
}

function getApiKey(config: TRumConfig): string {
  return config.authMode === 'publicToken' ? (config.publicToken ?? '') : 'placeholder';
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
  const { isAuthenticated, token, user } = useAuthContext();
  const location = useLocation();
  const initializedKeyRef = useRef<string | undefined>(undefined);
  const sampledInitKeyRef = useRef<string | undefined>(undefined);
  const sampledInRef = useRef<boolean>(true);
  const hyperDxRef = useRef<HyperDXBrowser | undefined>(undefined);
  const tokenRef = useRef<string | undefined>(token);
  const rumConfig = startupConfig?.rum;
  const route = useMemo(() => normalizeRumPath(location.pathname), [location.pathname]);
  const routeRef = useRef<string>(route);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    if (!rumConfig || rumConfig.authMode !== 'userJwt') {
      window.__libreChatRumInterceptor?.clear();
      return;
    }

    window.__libreChatRumInterceptor?.configure({
      url: rumConfig.url,
      authHeaderScheme: rumConfig.authHeaderScheme,
      tokenProvider: () => tokenRef.current,
    });

    return () => {
      window.__libreChatRumInterceptor?.clear();
    };
  }, [rumConfig]);

  useEffect(() => {
    if (!rumConfig) {
      return;
    }

    if (
      !shouldInitializeRum(rumConfig, token) ||
      (rumConfig.authMode === 'userJwt' && !isAuthenticated)
    ) {
      return;
    }

    const config = rumConfig;

    const initKey = [config.url, config.serviceName, config.authMode, config.publicToken].join(':');

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
          apiKey: getApiKey(config),
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
  }, [isAuthenticated, rumConfig, token, user]);

  useEffect(() => {
    hyperDxRef.current?.setGlobalAttributes(
      rumConfig ? buildGlobalAttributes(user, rumConfig, route) : { route },
    );
  }, [route, rumConfig, user]);
}
