import { useRecoilValue } from 'recoil';
import {
  OpenAISettings,
  BingAISettings,
  AnthropicSettings,
} from '~/components/Endpoints/Settings/';
import { GoogleSettings, PluginsSettings } from '~/components/Endpoints/Settings/MultiView';
import { ModelSelectProps, OptionComponent, MultiViewComponent } from 'librechat-data-provider';
import store from '~/store';

const optionComponents: { [key: string]: OptionComponent } = {
  openAI: OpenAISettings,
  bingAI: BingAISettings,
  anthropic: AnthropicSettings,
};

const multiViewComponents: { [key: string]: MultiViewComponent } = {
  google: GoogleSettings,
  gptPlugins: PluginsSettings,
};

export default function Settings({ conversation, setOption }: ModelSelectProps) {
  const endpointsConfig = useRecoilValue(store.endpointsConfig);
  if (!conversation?.endpoint) {
    return null;
  }

  const { endpoint } = conversation;
  const models = endpointsConfig?.[endpoint]?.['availableModels'] || [];
  const OptionComponent = optionComponents[endpoint];

  if (OptionComponent) {
    return <OptionComponent conversation={conversation} setOption={setOption} models={models} />;
  }

  const MultiViewComponent = multiViewComponents[endpoint];

  if (!MultiViewComponent) {
    return null;
  }

  return <MultiViewComponent models={models} />;
}
