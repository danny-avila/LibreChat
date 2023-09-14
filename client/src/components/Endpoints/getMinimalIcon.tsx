import React from 'react';
import {
  AzureMinimalistIcon,
  OpenAIMinimalistIcon,
  ChatGPTMinimalistIcon,
  PluginMinimalistIcon,
  BingAIMinimalistIcon,
  PaLMinimalistIcon,
  AnthropicMinimalistIcon,
} from '~/components/svg';
import { cn } from '~/utils';
import { IconProps } from '~/common';

const getMinimalIcon: React.FC<IconProps> = (props) => {
  const { size = 30, error } = props;

  let endpoint = 'default'; // Default value for endpoint

  if (typeof props.endpoint === 'string') {
    endpoint = props.endpoint;
  }

  const endpointIcons = {
    azureOpenAI: { icon: <AzureMinimalistIcon />, name: props.chatGptLabel || 'ChatGPT' },
    openAI: { icon: <OpenAIMinimalistIcon />, name: props.chatGptLabel || 'ChatGPT' },
    gptPlugins: { icon: <PluginMinimalistIcon />, name: 'Plugins' },
    google: { icon: <PaLMinimalistIcon />, name: props.modelLabel || 'PaLM2' },
    anthropic: { icon: <AnthropicMinimalistIcon />, name: props.modelLabel || 'Claude' },
    bingAI: { icon: <BingAIMinimalistIcon />, name: 'BingAI' },
    chatGPTBrowser: { icon: <ChatGPTMinimalistIcon />, name: 'ChatGPT' },
    default: { icon: <OpenAIMinimalistIcon />, name: 'UNKNOWN' },
  };

  const { icon, name } = endpointIcons[endpoint];

  return (
    <div
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

export default getMinimalIcon;
