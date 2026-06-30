import { useMemo, useCallback } from 'react';
import { useToastContext } from '@librechat/client';
import { Tools, AuthType, AgentCapabilities } from 'librechat-data-provider';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import { useLocalize, useHasMemoryAccess } from '~/hooks';
import { useVerifyAgentToolAuth } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { useAgentPanelContext } from '~/Providers';

/**
 * Maps builtin capability ids to whether they still need setup (USER_PROVIDED auth
 * not yet satisfied). Threaded into `buildCatalog` as `builtinAuthMap` so the
 * marketplace marks the capability `needs_setup` and routes its toggle to the
 * config dialog instead of silently enabling it without credentials. Only
 * `web_search` currently carries a user-provided key with an in-dialog entry point.
 */
export function useBuiltinAuthMap(): Map<string, boolean> {
  const { data } = useVerifyAgentToolAuth({ toolId: Tools.web_search }, { retry: 1 });
  return useMemo(() => {
    const map = new Map<string, boolean>();
    const isUserProvided =
      data?.authTypes?.some(([, authType]) => authType === AuthType.USER_PROVIDED) ?? false;
    if (isUserProvided && data?.authenticated !== true) {
      map.set(AgentCapabilities.web_search, true);
    }
    return map;
  }, [data]);
}

/**
 * Whether `web_search` uses USER_PROVIDED auth (a user-managed key). When false
 * the deployment uses SYSTEM_DEFINED keys, so there is nothing for the user to
 * configure. Shares the `useBuiltinAuthMap` React Query key, so it adds no
 * request. Threaded into `buildCatalog` so the card/row affordance is decided
 * synchronously (cog vs info) without a per-row hook.
 */
export function useWebSearchUserProvided(): boolean {
  const { data } = useVerifyAgentToolAuth({ toolId: Tools.web_search }, { retry: 1 });
  return useMemo(
    () => data?.authTypes?.some(([, authType]) => authType === AuthType.USER_PROVIDED) ?? false,
    [data],
  );
}

/**
 * Returns a callback that revokes a tool's stored user credentials when it is
 * removed from an agent, mirroring the legacy `AgentTool` removal. Without it,
 * removing a tool only drops it from the form and leaves the saved credentials
 * orphaned server-side. Fired unconditionally — a no-op for tools without creds.
 */
/**
 * Resolves whether the Memory capability should be offered in the builder.
 * Mirrors the legacy `AgentConfig` gate: the admin must enable the `memory`
 * capability, the user must hold the memory permission, and the user must not
 * have opted out of memories in personalization. Collapsed into one flag here
 * so both the selected list (`ToolsSection`) and the marketplace
 * (`ToolsMarketplaceDialog`) gate the catalog item identically.
 */
export function useShowMemory(): boolean {
  const { agentsConfig } = useAgentPanelContext();
  const hasMemoryAccess = useHasMemoryAccess();
  const { user } = useAuthContext();
  return useMemo(() => {
    const memoryEnabled = agentsConfig?.capabilities?.includes(AgentCapabilities.memory) ?? false;
    return hasMemoryAccess && memoryEnabled && user?.personalization?.memories !== false;
  }, [agentsConfig, hasMemoryAccess, user]);
}

export function useUninstallToolCredentials(): (toolId: string) => void {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const updateUserPlugins = useUpdateUserPluginsMutation();
  return useCallback(
    (toolId: string) => {
      if (!toolId) {
        return;
      }
      updateUserPlugins.mutate(
        { pluginKey: toolId, action: 'uninstall', auth: {}, isEntityTool: true },
        {
          onError: () =>
            showToast({ message: localize('com_ui_delete_tool_error'), status: 'error' }),
        },
      );
    },
    [updateUserPlugins, showToast, localize],
  );
}
