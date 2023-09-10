import React from 'react'; // Import React
import {
  AzureMinimalistIcon,
  OpenAIMinimalistIcon,
  ChatGPTMinimalistIcon,
  PluginMinimalistIcon,
  BingAIMinimalIcon,
  PaLMinimalistIcon,
  AnthropicMinimalistIcon,
} from '~/components/svg';
import { useAuthContext } from '~/hooks';
import { cn } from '~/utils';

// Define the Props interface
interface IconProps {
  size?: number;
  isCreatedByUser: boolean;
  button?: boolean;
  model?: string;
  message?: boolean;
  className?: string;
  endpoint?: string | null;
  chatGptLabel?: string;
  modelLabel?: string;
  jailbreak?: boolean;
  error?: boolean;
}

const getMinimalIcon: React.FC<IconProps> = (props) => {
  const { size = 30, isCreatedByUser, message = true } = props;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { user } = useAuthContext();

  if (isCreatedByUser) {
    return (
      <div
        title={user?.name || 'User'}
        style={{
          width: size,
          height: size,
        }}
        className={'relative flex items-center justify-center' + props?.className}
      >
        <img
          className="rounded-sm"
          src={
            user?.avatar ||
            `https://api.dicebear.com/6.x/initials/svg?seed=${
              user?.name || 'User'
            }&fontFamily=Verdana&fontSize=36`
          }
          alt="avatar"
        />
      </div>
    );
  } else if (!isCreatedByUser) {
    const { endpoint, error } = props;

    let icon, name;
    if (endpoint === 'azureOpenAI') {
      const { chatGptLabel } = props;
      icon = <AzureMinimalistIcon />;
      name = chatGptLabel || 'ChatGPT';
    } else if (endpoint === 'openAI') {
      const { chatGptLabel } = props;
      icon = <OpenAIMinimalistIcon />;
      name = chatGptLabel || 'ChatGPT';
    } else if (endpoint === 'gptPlugins' && message) {
      icon = <PluginMinimalistIcon />;
      name = 'Plugins';
    } else if (endpoint === 'google') {
      const { modelLabel } = props;
      icon = <PaLMinimalistIcon />;
      name = modelLabel || 'PaLM2';
    } else if (endpoint === 'anthropic') {
      const { modelLabel } = props;
      icon = <AnthropicMinimalistIcon />;
      name = modelLabel || 'Claude';
    } else if (endpoint === 'bingAI') {
      icon = <BingAIMinimalIcon />;
      name = 'BingAI';
    } else if (endpoint === 'chatGPTBrowser') {
      icon = <ChatGPTMinimalistIcon />;
      name = 'ChatGPT';
    } else if (endpoint === null) {
      icon = <OpenAIMinimalistIcon />;
      name = 'N/A';
    } else {
      icon = <OpenAIMinimalistIcon />;
      name = 'UNKNOWN';
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
          props?.className ?? '',
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
