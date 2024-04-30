// hooks/Plugins/usePluginInstall.ts
import { useCallback } from 'react';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import type { TError, TUser, TUpdateUserPlugins, TPluginAction } from 'librechat-data-provider';

interface PluginStoreHandlers {
  onInstallError?: (error: TError) => void;
  onUninstallError?: (error: TError) => void;
  onInstallSuccess?: (data: TUser, variables: TUpdateUserPlugins, context: unknown) => void;
  onUninstallSuccess?: (data: TUser, variables: TUpdateUserPlugins, context: unknown) => void;
}

export default function usePluginInstall(handlers: PluginStoreHandlers = {}) {
  const { onInstallError, onInstallSuccess, onUninstallError, onUninstallSuccess } = handlers;
  const updateUserPlugins = useUpdateUserPluginsMutation();

  const installPlugin = useCallback(
    (pluginAction: TPluginAction) => {
      updateUserPlugins.mutate(pluginAction, {
        onError: (error: unknown) => {
          if (onInstallError) {
            onInstallError(error as TError);
          }
        },
        onSuccess: (...rest) => {
          if (onInstallSuccess) {
            onInstallSuccess(...rest);
          }
        },
      });
    },
    [updateUserPlugins, onInstallError, onInstallSuccess],
  );

  const uninstallPlugin = useCallback(
    (plugin: string) => {
      updateUserPlugins.mutate(
        { pluginKey: plugin, action: 'uninstall', auth: null },
        {
          onError: (error: unknown) => {
            if (onUninstallError) {
              onUninstallError(error as TError);
            }
          },
          onSuccess: (...rest) => {
            if (onUninstallSuccess) {
              onUninstallSuccess(...rest);
            }
          },
        },
      );
    },
    [updateUserPlugins, onUninstallError, onUninstallSuccess],
  );

  return {
    installPlugin,
    uninstallPlugin,
  };
}
