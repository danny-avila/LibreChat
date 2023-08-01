import {
  OpenAISettings,
  BingAISettings,
  AnthropicSettings,
  GoogleSettings,
  PluginsSettings,
} from './Settings';
import { useRecoilValue } from 'recoil';
import store from '~/store';

// A preset dialog to show readonly preset values.
const Settings = ({ preset, readonly, setOption }) => {
  const { endpoint } = preset || {};
  const endpointsConfig = useRecoilValue(store.endpointsConfig);
  const models = endpointsConfig?.[endpoint]?.['availableModels'] || [];

  if (endpoint === 'openAI' || endpoint === 'azureOpenAI') {
    return (
      <OpenAISettings
        conversation={preset}
        setOption={setOption}
        models={models}
        readonly={false}
      />
    );
  } else if (endpoint === 'bingAI') {
    return <BingAISettings conversation={preset} setOption={setOption} readonly={readonly} />;
  } else if (endpoint === 'google') {
    return (
      <GoogleSettings conversation={preset} setOption={setOption} models={models} edit={true} />
    );
  } else if (endpoint === 'anthropic') {
    return (
      <AnthropicSettings
        conversation={preset}
        setOption={setOption}
        models={models}
        edit={true}
        readonly={readonly}
      />
    );
  } else if (endpoint === 'gptPlugins') {
    return (
      <PluginsSettings
        conversation={preset}
        setOption={setOption}
        models={models}
        // {...props}
      />
    );
  } else {
    return <div className="text-black dark:text-white">Not implemented</div>;
  }
};

export default Settings;
