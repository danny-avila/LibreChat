import { useRecoilValue } from 'recoil';
import type { TSettingsProps } from '~/common';
import { getSettings } from './Settings';
import { cn } from '~/utils';
import store from '~/store';

export default function Settings({
  conversation,
  setOption,
  isPreset = false,
  className = '',
  isMultiChat = false,
}: TSettingsProps & { isMultiChat?: boolean }) {
  const modelsConfig = useRecoilValue(store.modelsConfig);
  if (!conversation?.endpoint) {
    return null;
  }

  const { settings, multiViewSettings } = getSettings(isMultiChat);
  const { endpoint } = conversation;
  const models = modelsConfig?.[endpoint] ?? [];
  const OptionComponent = settings[endpoint];

  if (OptionComponent) {
    return (
      <div className={cn('h-[480px] overflow-y-auto md:mb-2 md:h-[350px]', className)}>
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
    <div className={cn('h-[480px] overflow-y-auto md:mb-2 md:h-[350px]', className)}>
      <MultiViewComponent conversation={conversation} models={models} isPreset={isPreset} />
    </div>
  );
}
