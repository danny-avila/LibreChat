import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import {
  DEFAULT_MCP_APPS_POLICY,
  resolveMCPAppCspLimits,
  type TMCPAppsPolicy,
  type TStartupConfig,
} from 'librechat-data-provider';

/** A loaded App owns two frames and a live bridge; cap them across the entire conversation. */
export const MAX_ACTIVE_MCP_APP_VIEWS = 3;

type MCPAppsHostContextValue = {
  reserveView: (key: string) => boolean;
  releaseView: (key: string) => void;
  policy: Readonly<TMCPAppsPolicy>;
  userId?: string;
};

const DEFAULT_MCP_APPS_HOST: MCPAppsHostContextValue = {
  reserveView: () => false,
  releaseView: () => undefined,
  policy: DEFAULT_MCP_APPS_POLICY,
};

const MCPAppsPolicyContext = createContext<MCPAppsHostContextValue>(DEFAULT_MCP_APPS_HOST);

function getPublishedPolicy(
  startupConfig: TStartupConfig | undefined,
  ready: boolean,
): Readonly<TMCPAppsPolicy> {
  const policy = startupConfig?.mcpApps;
  if (
    !ready ||
    typeof policy?.enabled !== 'boolean' ||
    typeof policy.legacyHtmlEnabled !== 'boolean'
  ) {
    return DEFAULT_MCP_APPS_POLICY;
  }
  return { ...policy, cspLimits: resolveMCPAppCspLimits(policy.cspLimits) };
}

export function MCPAppsPolicyProvider({
  children,
  startupConfig,
  ready,
  userId,
}: {
  children: React.ReactNode;
  startupConfig?: TStartupConfig;
  ready: boolean;
  userId?: string;
}) {
  const policy = useMemo(() => getPublishedPolicy(startupConfig, ready), [ready, startupConfig]);
  const activeViews = useRef(new Set<string>());
  const reserveView = useCallback((key: string) => {
    if (activeViews.current.size >= MAX_ACTIVE_MCP_APP_VIEWS) return false;
    activeViews.current.add(key);
    return true;
  }, []);
  const releaseView = useCallback((key: string) => {
    activeViews.current.delete(key);
  }, []);
  const authenticatedUserId = typeof userId === 'string' && userId.trim() ? userId : undefined;
  const value = useMemo(
    () => ({ policy, userId: authenticatedUserId, reserveView, releaseView }),
    [authenticatedUserId, policy, reserveView, releaseView],
  );

  return <MCPAppsPolicyContext.Provider value={value}>{children}</MCPAppsPolicyContext.Provider>;
}

export function useMCPAppsPolicy(): Readonly<TMCPAppsPolicy> {
  return useContext(MCPAppsPolicyContext).policy;
}

export function useMCPAppsHost(): MCPAppsHostContextValue {
  return useContext(MCPAppsPolicyContext);
}
