import { useRecoilValue } from 'recoil';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import { getEndpointField, getDefaultParamsEndpoint, SettingsViews } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import type { TSettingsProps } from '~/common';
import { useGetEndpointsQuery } from '~/data-provider';
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
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const currentSettingsView = useRecoilValue(store.currentSettingsView);
  const conversationEndpoint = conversation?.endpoint ?? '';
  const endpointType = getEndpointField(endpointsConfig, conversationEndpoint, 'type');
  /**
   * Resolve the configured default-params endpoint first, matching the side panel and
   * Agent Builder. A named custom endpoint can declare a provider whose controls differ
   * from the OpenAI-shaped `custom` default — BAML declares an empty set, so no panel
   * renders at all.
   */
  const defaultParamsEndpoint = getDefaultParamsEndpoint(endpointsConfig, conversationEndpoint);
  const endpoint = defaultParamsEndpoint ?? endpointType ?? conversationEndpoint;
  if (!endpoint || currentSettingsView !== SettingsViews.default) {
    return null;
  }

  const { settings, multiViewSettings } = getSettings();
  const { endpoint: _endpoint } = conversation as TConversation;
  const models = modelsQuery.data?.[_endpoint ?? ''] ?? [];
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

  if (MultiViewComponent == null) {
    return null;
  }

  return (
    <div className={cn('hide-scrollbar h-[500px] overflow-y-auto md:mb-2 md:h-[350px]', className)}>
      <MultiViewComponent conversation={conversation} models={models} isPreset={isPreset} />
    </div>
  );
}
