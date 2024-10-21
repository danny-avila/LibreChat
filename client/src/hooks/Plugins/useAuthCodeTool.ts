import { useCallback } from 'react';
import { Tools } from 'librechat-data-provider';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
// import { useToastContext } from '~/Providers';

const useAuthCodeTool = (options?: { isEntityTool: boolean }) => {
  // const { showToast } = useToastContext();
  const isEntityTool = options?.isEntityTool ?? true;
  const updateUserPlugins = useUpdateUserPluginsMutation();

  const installTool = useCallback(
    (apiKey: string) => {
      updateUserPlugins.mutate({
        pluginKey: Tools.execute_code,
        action: 'install',
        auth: { LIBRECHAT_CODE_API_KEY: apiKey },
        isEntityTool,
      });
    },
    [updateUserPlugins, isEntityTool],
  );

  const removeTool = useCallback(() => {
    updateUserPlugins.mutate({
      pluginKey: Tools.execute_code,
      action: 'uninstall',
      auth: { LIBRECHAT_CODE_API_KEY: null },
      isEntityTool,
    });
  }, [updateUserPlugins, isEntityTool]);

  return {
    removeTool,
    installTool,
  };
};

export default useAuthCodeTool;
