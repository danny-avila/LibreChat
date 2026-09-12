import { createContext, useContext, useMemo } from 'react';
import {
  DEFAULT_MCP_APPS_POLICY,
  type TMCPAppsPolicy,
  type TStartupConfig,
} from 'librechat-data-provider';

const MCPAppsPolicyContext = createContext<Readonly<TMCPAppsPolicy>>(DEFAULT_MCP_APPS_POLICY);

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
}: {
  children: React.ReactNode;
  startupConfig?: TStartupConfig;
  ready: boolean;
}) {
  const policy = useMemo(() => getPublishedPolicy(startupConfig, ready), [ready, startupConfig]);

  return <MCPAppsPolicyContext.Provider value={policy}>{children}</MCPAppsPolicyContext.Provider>;
}

export function useMCPAppsPolicy(): Readonly<TMCPAppsPolicy> {
  return useContext(MCPAppsPolicyContext);
}
