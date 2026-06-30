import { useMemo, useCallback } from 'react';
import { useToastContext } from '@librechat/client';
import { Tools, AuthType, AgentCapabilities } from 'librechat-data-provider';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import { useVerifyAgentToolAuth } from '~/data-provider';
import { useLocalize } from '~/hooks';

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
 * Returns a callback that revokes a tool's stored user credentials when it is
 * removed from an agent, mirroring the legacy `AgentTool` removal. Without it,
 * removing a tool only drops it from the form and leaves the saved credentials
 * orphaned server-side. Fired unconditionally — a no-op for tools without creds.
 */
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
