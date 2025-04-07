import type { TPlugin, TStartupConfig, TUser } from 'librechat-data-provider';
import { LocalStorageKeys } from 'librechat-data-provider';
import { useAvailablePluginsQuery } from 'librechat-data-provider/react-query';
import { useEffect } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import store from '~/store';
import { mapPlugins, processPlugins, selectPlugins } from '~/utils';

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
  const setAvailableTools = useSetRecoilState(store.availableTools);
  const [defaultPreset, setDefaultPreset] = useRecoilState(store.defaultPreset);
  const { data: allPlugins } = useAvailablePluginsQuery({
    enabled: !!user?.plugins,
    select: selectPlugins,
  });

  /** Set the app title */
  useEffect(() => {
    const appTitle = startupConfig?.appTitle ?? '';
    if (!appTitle) {
      return;
    }
    document.title = appTitle;
  }, [startupConfig]);

  /** Set the default spec's preset as default */
  useEffect(() => {
    if (defaultPreset && defaultPreset.spec != null) {
      return;
    }

    const modelSpecs = startupConfig?.modelSpecs?.list;

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
  }, [defaultPreset, setDefaultPreset, startupConfig?.modelSpecs?.list]);

  /** Set the available Plugins */
  useEffect(() => {
    if (!user) {
      return;
    }

    if (!allPlugins) {
      return;
    }

    const userPlugins = user.plugins ?? [];

    if (userPlugins.length === 0) {
      setAvailableTools({ pluginStore });
      return;
    }

    const tools = [...userPlugins]
      .map((el) => allPlugins.map[el])
      .filter((el: TPlugin | undefined): el is TPlugin => el !== undefined);

    /* Filter Last Selected Tools */
    const localStorageItem = localStorage.getItem(LocalStorageKeys.LAST_TOOLS) ?? '';
    if (!localStorageItem) {
      return setAvailableTools({ pluginStore, ...mapPlugins(tools) });
    }
    const lastSelectedTools = processPlugins(JSON.parse(localStorageItem) ?? [], allPlugins.map);
    const filteredTools = lastSelectedTools
      .filter((tool: TPlugin) =>
        tools.some((existingTool) => existingTool.pluginKey === tool.pluginKey),
      )
      .filter((tool: TPlugin | undefined) => !!tool);
    localStorage.setItem(LocalStorageKeys.LAST_TOOLS, JSON.stringify(filteredTools));

    setAvailableTools({ pluginStore, ...mapPlugins(tools) });
  }, [allPlugins, user, setAvailableTools]);
}
