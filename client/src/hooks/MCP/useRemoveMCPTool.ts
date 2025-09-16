import { useCallback } from 'react';
import { useFormContext } from 'react-hook-form';
import { Constants } from 'librechat-data-provider';
import { useToastContext } from '@librechat/client';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';

/**
 * Hook for removing MCP tools/servers from an agent
 * Provides unified logic for MCPTool, UninitializedMCPTool, and UnconfiguredMCPTool components
 */
export function useRemoveMCPTool() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const updateUserPlugins = useUpdateUserPluginsMutation();
  const { getValues, setValue } = useFormContext<AgentForm>();

  const removeTool = useCallback(
    (serverName: string) => {
      if (!serverName) {
        return;
      }

      updateUserPlugins.mutate(
        {
          pluginKey: `${Constants.mcp_prefix}${serverName}`,
          action: 'uninstall',
          auth: {},
          isEntityTool: true,
        },
        {
          onError: (error: unknown) => {
            showToast({
              message: localize('com_ui_delete_tool_error', { error: String(error) }),
              status: 'error',
            });
          },
          onSuccess: () => {
            const currentTools = getValues('tools');
            const remainingToolIds =
              currentTools?.filter(
                (currentToolId) =>
                  currentToolId !== serverName &&
                  !currentToolId.endsWith(`${Constants.mcp_delimiter}${serverName}`),
              ) || [];
            setValue('tools', remainingToolIds, { shouldDirty: true });

            showToast({
              message: localize('com_ui_delete_tool_save_reminder'),
              status: 'warning',
            });
          },
        },
      );
    },
    [getValues, setValue, updateUserPlugins, showToast, localize],
  );

  return { removeTool };
}
