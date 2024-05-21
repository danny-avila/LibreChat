import { useRecoilValue } from 'recoil';
import { SettingsViews } from 'librechat-data-provider';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import type { TSettingsProps } from '~/common';
import { getSettings } from './Settings';
import { cn } from '~/utils';
import store from '~/store';

export default function Settings({
  conversation,
  setOption,
  isPreset = false,
  className = '',
}: TSettingsProps) {
  const modelsQuery = useGetModelsQuery();
  const currentSettingsView = useRecoilValue(store.currentSettingsView);
  if (!conversation?.endpoint || currentSettingsView !== SettingsViews.default) {
    return null;
  }

  const { settings, multiViewSettings } = getSettings();
  const { endpoint: _endpoint, endpointType } = conversation;
  const models = modelsQuery?.data?.[_endpoint] ?? [];
  const endpoint = endpointType ?? _endpoint;
  const OptionComponent = settings[endpoint];

  if (OptionComponent) {
    return (
      <div className={cn('h-[500px] overflow-y-auto md:mb-2 md:h-[350px]', className)}>
        <OptionComponent
          conversation={conversation}
          setOption={setOption}
          models={models}
          isPreset={isPreset}
        />
      </div>
    );
  }

  const MultiViewComponent = multiViewSettings[endpoint];

  if (!MultiViewComponent) {
    return null;
  }

  return (
    <div className={cn('hide-scrollbar h-[500px] overflow-y-auto md:mb-2 md:h-[350px]', className)}>
      <MultiViewComponent conversation={conversation} models={models} isPreset={isPreset} />
    </div>
  );
}
