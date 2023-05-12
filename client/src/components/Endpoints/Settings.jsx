import React from 'react';

import OpenAISettings from './OpenAI/Settings.jsx';
import BingAISettings from './BingAI/Settings.jsx';
import GoogleSettings from './Google/Settings.jsx';

// A preset dialog to show readonly preset values.
const Settings = ({ preset, ...props }) => {
  const renderSettings = () => {
    const { endpoint } = preset || {};

    if (endpoint === 'openAI') {
      return (
        <OpenAISettings
          model={preset?.model}
          chatGptLabel={preset?.chatGptLabel}
          promptPrefix={preset?.promptPrefix}
          temperature={preset?.temperature}
          topP={preset?.top_p}
          freqP={preset?.presence_penalty}
          presP={preset?.frequency_penalty}
          {...props}
        />
      );
    } else if (endpoint === 'bingAI') {
      return (
        <BingAISettings
          toneStyle={preset?.toneStyle}
          context={preset?.context}
          systemMessage={preset?.systemMessage}
          jailbreak={preset?.jailbreak}
          {...props}
        />
      );
    } else if (endpoint === 'google') {
      return (
        <GoogleSettings
          model={preset?.model}
          modelLabel={preset?.modelLabel}
          promptPrefix={preset?.promptPrefix}
          temperature={preset?.temperature}
          topP={preset?.topP}
          topK={preset?.topK}
          maxOutputTokens={preset?.maxOutputTokens}
          {...props}
        />
      );
    } else {
      return <div className="text-black dark:text-white">Not implemented</div>;
    }
  };

  return renderSettings();
};

export default Settings;
