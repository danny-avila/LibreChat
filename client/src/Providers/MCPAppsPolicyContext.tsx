import { createContext, useContext, useMemo } from 'react';
import {
  DEFAULT_MCP_APPS_POLICY,
  type TMCPAppsPolicy,
  type TStartupConfig,
} from 'librechat-data-provider';

type MCPAppsHostContextValue = {
  policy: Readonly<TMCPAppsPolicy>;
  userId?: string;
};

const DEFAULT_MCP_APPS_HOST: MCPAppsHostContextValue = {
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
  return policy;
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
  const authenticatedUserId = typeof userId === 'string' && userId.trim() ? userId : undefined;
  const value = useMemo(
    () => ({ policy, userId: authenticatedUserId }),
    [authenticatedUserId, policy],
  );

  return <MCPAppsPolicyContext.Provider value={value}>{children}</MCPAppsPolicyContext.Provider>;
}

export function useMCPAppsPolicy(): Readonly<TMCPAppsPolicy> {
  return useContext(MCPAppsPolicyContext).policy;
}

export function useMCPAppsHost(): MCPAppsHostContextValue {
  return useContext(MCPAppsPolicyContext);
}
