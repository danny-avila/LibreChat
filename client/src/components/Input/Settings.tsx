import { useRecoilValue } from 'recoil';
import {
  OpenAISettings,
  BingAISettings,
  AnthropicSettings,
} from '~/components/Endpoints/Settings/';
import { GoogleSettings, PluginsSettings } from '~/components/Endpoints/Settings/MultiView';
import { SettingsProps, OptionComponent, MultiViewComponent } from 'librechat-data-provider';
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

export default function Settings({ conversation, setOption, isPreset = false }: SettingsProps) {
  const endpointsConfig = useRecoilValue(store.endpointsConfig);
  if (!conversation?.endpoint) {
    return null;
  }

  const { endpoint } = conversation;
  const models = endpointsConfig?.[endpoint]?.['availableModels'] || [];
  const OptionComponent = optionComponents[endpoint];

  if (OptionComponent) {
    return (
      <OptionComponent
        conversation={conversation}
        setOption={setOption}
        models={models}
        isPreset={isPreset}
      />
    );
  }

  const MultiViewComponent = multiViewComponents[endpoint];

  if (!MultiViewComponent) {
    return null;
  }

  return <MultiViewComponent conversation={conversation} models={models} isPreset={isPreset} />;
}
