import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { LocalStorageKeys } from 'librechat-data-provider';
import type { TStartupConfig } from 'librechat-data-provider';
import { data as modelSpecs } from '~/components/Chat/Menus/Models/fakeData';
import useConfigOverride from './useConfigOverride';
import store from '~/store';

export default function useAppStartup(startupConfig?: TStartupConfig) {
  useConfigOverride();
  const [defaultPreset, setDefaultPreset] = useRecoilState(store.defaultPreset);

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
}
