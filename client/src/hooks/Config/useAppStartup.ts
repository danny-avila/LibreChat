import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import useConfigOverride from './useConfigOverride';
import store from '~/store';
import { data as modelSpecs } from '~/components/Chat/Menus/Models/fakeData';

export default function useAppStartup() {
  useConfigOverride();
  const { data: startupConfig } = useGetStartupConfig();
  const [defaultPreset, setDefaultPreset] = useRecoilState(store.defaultPreset);

  /** Set the app title */
  useEffect(() => {
    if (startupConfig?.appTitle) {
      document.title = startupConfig.appTitle;
      localStorage.setItem('appTitle', startupConfig.appTitle);
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
