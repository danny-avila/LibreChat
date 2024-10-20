import { useCallback } from 'react';
import { Tools } from 'librechat-data-provider';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
// import { useToastContext } from '~/Providers';

export const useExecuteCodeTool = (options?: { isEntityTool: boolean }) => {
  // const { showToast } = useToastContext();
  const isEntityTool = options?.isEntityTool ?? true;
  const updateUserPlugins = useUpdateUserPluginsMutation();

  const installTool = useCallback(
    (auth: Record<string, string>) => {
      updateUserPlugins.mutate({
        pluginKey: Tools.execute_code,
        action: 'install',
        auth,
        isEntityTool,
      });
    },
    [updateUserPlugins, isEntityTool],
  );

  const removeTool = useCallback(() => {
    updateUserPlugins.mutate({
      pluginKey: Tools.execute_code,
      action: 'uninstall',
      auth: null,
      isEntityTool,
    });
  }, [updateUserPlugins, isEntityTool]);

  return {
    removeTool,
    installTool,
  };
};
