import React from 'react';
import { Plugin, GPTIcon, AnthropicIcon } from '~/components/svg';
import { useAuthContext } from '~/hooks';
import { cn } from '~/utils';

interface IconProps {
  size?: number;
  isCreatedByUser?: boolean;
  button?: boolean;
  model?: string;
  message?: boolean;
  className?: string;
  endpoint?: string | null;
  error?: boolean;
  chatGptLabel?: string;
  modelLabel?: string;
  jailbreak?: boolean;
}

const getIcon: React.FC<IconProps> = (props) => {
  const { size = 30, isCreatedByUser, button, model = true } = props;
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
    let icon, bg, name;

    switch (endpoint) {
      case 'azureOpenAI': {
        const { chatGptLabel } = props;
        icon = <GPTIcon size={size * 0.7} />;
        bg = 'linear-gradient(0.375turn, #61bde2, #4389d0)';
        name = chatGptLabel || 'ChatGPT';
        break;
      }

      case 'openAI': {
        const { chatGptLabel } = props;
        icon = <GPTIcon size={size * 0.7} />;
        bg =
          typeof model === 'string' && model.toLowerCase().startsWith('gpt-4')
            ? '#AB68FF'
            : chatGptLabel
              ? '#19C37D'
              : '#19C37D';
        name = chatGptLabel || 'ChatGPT';
        break;
      }

      case 'gptPlugins': {
        icon = <Plugin size={size * 0.7} />;
        bg = `rgba(69, 89, 164, ${button ? 0.75 : 1})`;
        name = 'Plugins';
        break;
      }

      case 'google': {
        const { modelLabel } = props;
        icon = <img src="/assets/google-palm.svg" alt="Palm Icon" />;
        name = modelLabel || 'PaLM2';
        break;
      }

      case 'anthropic': {
        const { modelLabel } = props;
        icon = <AnthropicIcon size={size * 0.7} />;
        bg = '#d09a74';
        name = modelLabel || 'Claude';
        break;
      }

      case 'bingAI': {
        const { jailbreak } = props;
        if (jailbreak) {
          icon = <img src="/assets/bingai-jb.png" alt="Bing Icon" />;
          name = 'Sydney';
        } else {
          icon = <img src="/assets/bingai.png" alt="Sydney Icon" />;
          name = 'BingAI';
        }
        break;
      }

      case 'chatGPTBrowser': {
        icon = <GPTIcon size={size * 0.7} />;
        bg =
          typeof model === 'string' && model.toLowerCase().startsWith('gpt-4')
            ? '#AB68FF'
            : `rgba(0, 163, 255, ${button ? 0.75 : 1})`;
        name = 'ChatGPT';
        break;
      }

      case null: {
        icon = <GPTIcon size={size * 0.7} />;
        bg = 'grey';
        name = 'N/A';
        break;
      }

      default: {
        icon = <GPTIcon size={size * 0.7} />;
        bg = 'grey';
        name = 'UNKNOWN';
        break;
      }
    }

    return (
      <div
        title={name}
        style={{
          background: bg || 'transparent',
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

export default getIcon;
