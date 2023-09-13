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
import { useAuthContext } from '~/hooks';
import { cn } from '~/utils';
import { IconProps } from '~/common';

const getMinimalIcon: React.FC<IconProps> = (props) => {
  const { size = 30, isCreatedByUser, message = true } = props;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { user } = useAuthContext();

  if (isCreatedByUser) {
    const username = user?.name || 'User';

    return (
      <div
        title={username}
        style={{
          width: size,
          height: size,
        }}
        className={`relative flex items-center justify-center ${props.className || ''}`}
      >
        <img
          className="rounded-sm"
          src={
            user?.avatar ||
            `https://api.dicebear.com/6.x/initials/svg?seed=${username}&fontFamily=Verdana&fontSize=36`
          }
          alt="avatar"
        />
      </div>
    );
  } else {
    const { endpoint, error } = props;
    let icon, name;

    switch (endpoint) {
      case 'azureOpenAI': {
        const { chatGptLabel } = props;
        icon = <AzureMinimalistIcon />;
        name = chatGptLabel || 'ChatGPT';
        break;
      }

      case 'openAI': {
        const { chatGptLabel } = props;
        icon = <OpenAIMinimalistIcon />;
        name = chatGptLabel || 'ChatGPT';
        break;
      }

      case 'gptPlugins': {
        if (message) {
          icon = <PluginMinimalistIcon />;
          name = 'Plugins';
        }
        break;
      }

      case 'google': {
        const { modelLabel } = props;
        icon = <PaLMinimalistIcon />;
        name = modelLabel || 'PaLM2';
        break;
      }

      case 'anthropic': {
        const { modelLabel } = props;
        icon = <AnthropicMinimalistIcon />;
        name = modelLabel || 'Claude';
        break;
      }

      case 'bingAI': {
        icon = <BingAIMinimalistIcon />;
        name = 'BingAI';
        break;
      }

      case 'chatGPTBrowser': {
        icon = <ChatGPTMinimalistIcon />;
        name = 'ChatGPT';
        break;
      }

      case null: {
        icon = <OpenAIMinimalistIcon />;
        name = 'N/A';
        break;
      }

      default: {
        icon = <OpenAIMinimalistIcon />;
        name = 'UNKNOWN';
        break;
      }
    }

    return (
      <div
        title={name}
        style={{
          width: size,
          height: size,
        }}
        className={cn(
          'relative flex items-center justify-center rounded-sm text-white ',
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
  }
};

export default getMinimalIcon;
