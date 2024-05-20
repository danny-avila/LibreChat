import { useEffect } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { LocalStorageKeys } from 'librechat-data-provider';
import { useAvailablePluginsQuery } from 'librechat-data-provider/react-query';
import type { TStartupConfig, TPlugin, TUser } from 'librechat-data-provider';
import { data as modelSpecs } from '~/components/Chat/Menus/Models/fakeData';
import { mapPlugins, selectPlugins, processPlugins } from '~/utils';
import useConfigOverride from './useConfigOverride';
import store from '~/store';

const pluginStore: TPlugin = {
  name: 'Plugin store',
  pluginKey: 'pluginStore',
  isButton: true,
  description: '',
  icon: '',
  authConfig: [],
  authenticated: false,
};

export default function useAppStartup({
  startupConfig,
  user,
}: {
  startupConfig?: TStartupConfig;
  user?: TUser;
}) {
  useConfigOverride();
  const setAvailableTools = useSetRecoilState(store.availableTools);
  const [defaultPreset, setDefaultPreset] = useRecoilState(store.defaultPreset);
  const { data: allPlugins } = useAvailablePluginsQuery({
    enabled: !!user?.plugins,
    select: selectPlugins,
  });

  /** Set the app title */
  useEffect(() => {
    if (startupConfig?.appTitle) {
      document.title = startupConfig.appTitle;
      localStorage.setItem(LocalStorageKeys.APP_TITLE, startupConfig.appTitle);
    }
  }, [startupConfig]);

  /** Set the default spec's preset as default */
  useEffect(() => {
    if (defaultPreset && defaultPreset.spec) {
      return;
    }

    if (!modelSpecs || !modelSpecs.length) {
      return;
    }

    const defaultSpec = modelSpecs.find((spec) => spec.default);

    if (!defaultSpec) {
      return;
    }

    setDefaultPreset({
      ...defaultSpec.preset,
      iconURL: defaultSpec.iconURL,
      spec: defaultSpec.name,
    });
  }, [defaultPreset, setDefaultPreset]);

  /** Set the available Plugins */
  useEffect(() => {
    if (!user) {
      return;
    }

    if (!allPlugins) {
      return;
    }

    if (!user.plugins || user.plugins.length === 0) {
      setAvailableTools({ pluginStore });
      return;
    }

    const tools = [...user.plugins]
      .map((el) => allPlugins.map[el])
      .filter((el): el is TPlugin => el !== undefined);

    /* Filter Last Selected Tools */
    const localStorageItem = localStorage.getItem(LocalStorageKeys.LAST_TOOLS);
    if (!localStorageItem) {
      return setAvailableTools({ pluginStore, ...mapPlugins(tools) });
    }
    const lastSelectedTools = processPlugins(JSON.parse(localStorageItem) ?? [], allPlugins.map);
    const filteredTools = lastSelectedTools
      .filter((tool: TPlugin) =>
        tools.some((existingTool) => existingTool.pluginKey === tool.pluginKey),
      )
      .filter((tool: TPlugin) => !!tool);
    localStorage.setItem(LocalStorageKeys.LAST_TOOLS, JSON.stringify(filteredTools));

    setAvailableTools({ pluginStore, ...mapPlugins(tools) });
  }, [allPlugins, user, setAvailableTools]);
}
