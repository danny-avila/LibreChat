// hooks/Plugins/usePluginInstall.ts
import { useCallback } from 'react';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import type {
  TError,
  TUser,
  TUpdateUserPlugins,
  TPlugin,
  TPluginAction,
} from 'librechat-data-provider';
import { useSetRecoilState } from 'recoil';
import store from '~/store';

interface PluginStoreHandlers {
  onInstallError?: (error: TError) => void;
  onUninstallError?: (error: TError) => void;
  onInstallSuccess?: (data: TUser, variables: TUpdateUserPlugins, context: unknown) => void;
  onUninstallSuccess?: (data: TUser, variables: TUpdateUserPlugins, context: unknown) => void;
}

export default function usePluginInstall(handlers: PluginStoreHandlers = {}) {
  const setAvailableTools = useSetRecoilState(store.availableTools);
  const { onInstallError, onInstallSuccess, onUninstallError, onUninstallSuccess } = handlers;
  const updateUserPlugins = useUpdateUserPluginsMutation();

  const installPlugin = useCallback(
    (pluginAction: TPluginAction, plugin: TPlugin) => {
      updateUserPlugins.mutate(pluginAction, {
        onError: (error: unknown) => {
          if (onInstallError) {
            onInstallError(error as TError);
          }
        },
        onSuccess: (...rest) => {
          setAvailableTools((prev) => {
            return { ...prev, [plugin.pluginKey]: plugin };
          });
          if (onInstallSuccess) {
            onInstallSuccess(...rest);
          }
        },
      });
    },
    [updateUserPlugins, onInstallError, onInstallSuccess, setAvailableTools],
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
            setAvailableTools((prev) => {
              const newAvailableTools = { ...prev };
              delete newAvailableTools[plugin];
              return newAvailableTools;
            });
            if (onUninstallSuccess) {
              onUninstallSuccess(...rest);
            }
          },
        },
      );
    },
    [updateUserPlugins, onUninstallError, onUninstallSuccess, setAvailableTools],
  );

  return {
    installPlugin,
    uninstallPlugin,
  };
}
