import React from 'react';
import {
  AzureMinimalIcon,
  OpenAIMinimalIcon,
  ChatGPTMinimalIcon,
  PluginMinimalIcon,
  BingAIMinimalIcon,
  PaLMinimalIcon,
  AnthropicMinimalIcon,
} from '~/components/svg';
import { cn } from '~/utils';
import { IconProps } from '~/common';

const MinimalIcon: React.FC<IconProps> = (props) => {
  const { size = 30, error } = props;

  let endpoint = 'default'; // Default value for endpoint

  if (typeof props.endpoint === 'string') {
    endpoint = props.endpoint;
  }

  const endpointIcons = {
    azureOpenAI: { icon: <AzureMinimalIcon />, name: props.chatGptLabel || 'ChatGPT' },
    openAI: { icon: <OpenAIMinimalIcon />, name: props.chatGptLabel || 'ChatGPT' },
    gptPlugins: { icon: <PluginMinimalIcon />, name: 'Plugins' },
    google: { icon: <PaLMinimalIcon />, name: props.modelLabel || 'PaLM2' },
    anthropic: { icon: <AnthropicMinimalIcon />, name: props.modelLabel || 'Claude' },
    bingAI: { icon: <BingAIMinimalIcon />, name: 'BingAI' },
    chatGPTBrowser: { icon: <ChatGPTMinimalIcon />, name: 'ChatGPT' },
    default: { icon: <OpenAIMinimalIcon />, name: 'UNKNOWN' },
  };

  const { icon, name } = endpointIcons[endpoint];

  return (
    <div
      data-testid="convo-icon"
      title={name}
      style={{
        width: size,
        height: size,
      }}
      className={cn(
        'relative flex items-center justify-center rounded-sm text-white',
        props.className || '',
      )}
    >
      {icon}
      {error && (
        <span className="absolute right-0 top-[20px] -mr-2 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-red-500 text-[10px] text-white">
          !
        </span>
      )}
    </div>
  );
};

export default MinimalIcon;
