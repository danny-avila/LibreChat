import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import TagManager from 'react-gtm-module';
import { LocalStorageKeys } from 'librechat-data-provider';
import type { TStartupConfig, TUser } from 'librechat-data-provider';
import { BKL_APP_TITLE } from '~/components/Bkl/brand';
import { cleanupTimestampedStorage } from '~/utils/timestamps';
import useSpeechSettingsInit from './useSpeechSettingsInit';
import { useMCPToolsQuery, useMCPServersQuery } from '~/data-provider';
import store from '~/store';

export default function useAppStartup({
  startupConfig,
  user,
}: {
  startupConfig?: TStartupConfig;
  user?: TUser;
}) {
  const [defaultPreset, setDefaultPreset] = useRecoilState(store.defaultPreset);

  useSpeechSettingsInit(!!user);
  const { data: loadedServers, isLoading: serversLoading } = useMCPServersQuery();

  useMCPToolsQuery({
    enabled: !serversLoading && !!loadedServers && Object.keys(loadedServers).length > 0 && !!user,
  });

  /** Clean up old localStorage entries on startup */
  useEffect(() => {
    cleanupTimestampedStorage();
  }, []);

  /**
   * Set the app title.
   *
   * 원본은 서버 `APP_TITLE` 을 받아 그대로 캐시했는데, 그 캐시를 문서검색 ·
   * 프로젝트 화면이 제목으로 재사용한다. 배포 env 가 옛 이름으로 남아 있으면
   * 여러 화면이 한꺼번에 옛 이름을 달게 되므로 브랜드 상수로 고정하고, 이미
   * 옛 값이 들어 있는 캐시도 이 시점에 덮어 정리한다.
   */
  useEffect(() => {
    document.title = BKL_APP_TITLE;
    localStorage.setItem(LocalStorageKeys.APP_TITLE, BKL_APP_TITLE);
  }, []);

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

  useEffect(() => {
    if (startupConfig?.analyticsGtmId != null && typeof window.google_tag_manager === 'undefined') {
      const tagManagerArgs = {
        gtmId: startupConfig.analyticsGtmId,
      };
      TagManager.initialize(tagManagerArgs);
    }
  }, [startupConfig?.analyticsGtmId]);
}
