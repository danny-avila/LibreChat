import {
  OpenAISettings,
  BingAISettings,
  AnthropicSettings,
  GoogleSettings,
  PluginsSettings,
} from './Settings';

// A preset dialog to show readonly preset values.
const Settings = ({ preset, readonly, setOption }) => {
  const renderSettings = () => {
    const { endpoint } = preset || {};

    if (endpoint === 'openAI' || endpoint === 'azureOpenAI') {
      return <OpenAISettings conversation={preset} setOption={setOption} readonly={false} />;
    } else if (endpoint === 'bingAI') {
      return <BingAISettings conversation={preset} setOption={setOption} readonly={readonly} />;
    } else if (endpoint === 'google') {
      return <GoogleSettings conversation={preset} setOption={setOption} edit={true} />;
    } else if (endpoint === 'anthropic') {
      return (
        <AnthropicSettings
          conversation={preset}
          setOption={setOption}
          edit={true}
          readonly={readonly}
        />
      );
    } else if (endpoint === 'gptPlugins') {
      return (
        <PluginsSettings
          conversation={preset}
          setOption={setOption}
          // {...props}
        />
      );
    } else {
      return <div className="text-black dark:text-white">Not implemented</div>;
    }
  };

  return renderSettings();
};

export default Settings;
