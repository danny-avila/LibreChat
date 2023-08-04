import { useRecoilValue } from 'recoil';
import { OpenAISettings, BingAISettings, AnthropicSettings } from './Settings';
import { GoogleSettings, PluginsSettings } from './Settings/MultiView';
import { SettingsProps, OptionComponent, MultiViewComponent } from 'librechat-data-provider';
import { cn } from '~/utils';
import store from '~/store';

const optionComponents: { [key: string]: OptionComponent } = {
  openAI: OpenAISettings,
  azureOpenAI: OpenAISettings,
  bingAI: BingAISettings,
  anthropic: AnthropicSettings,
};

const multiViewComponents: { [key: string]: MultiViewComponent } = {
  google: GoogleSettings,
  gptPlugins: PluginsSettings,
};

export default function Settings({
  conversation,
  setOption,
  isPreset = false,
  className = '',
}: SettingsProps) {
  const endpointsConfig = useRecoilValue(store.endpointsConfig);
  if (!conversation?.endpoint) {
    return null;
  }

  const { endpoint } = conversation;
  const models = endpointsConfig?.[endpoint]?.['availableModels'] || [];
  const OptionComponent = optionComponents[endpoint];

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

  const MultiViewComponent = multiViewComponents[endpoint];

  if (!MultiViewComponent) {
    return null;
  }

  return (
    <div className={cn('h-[480px] overflow-y-auto md:mb-2 md:h-[350px]', className)}>
      <MultiViewComponent conversation={conversation} models={models} isPreset={isPreset} />
    </div>
  );
}
