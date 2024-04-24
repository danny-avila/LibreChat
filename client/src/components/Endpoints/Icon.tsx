import { EModelEndpoint } from 'librechat-data-provider';
import UnknownIcon from '~/components/Chat/Menus/Endpoints/UnknownIcon';
import {
  Plugin,
  GPTIcon,
  UserIcon,
  PaLMIcon,
  CodeyIcon,
  GeminiIcon,
  AssistantIcon,
  AnthropicIcon,
  AzureMinimalIcon,
  CustomMinimalIcon,
} from '~/components/svg';
import { useAuthContext } from '~/hooks/AuthContext';
import useAvatar from '~/hooks/Messages/useAvatar';
import useLocalize from '~/hooks/useLocalize';
import { IconProps } from '~/common';
import { cn } from '~/utils';

const Icon: React.FC<IconProps> = (props) => {
  const { user } = useAuthContext();
  const {
    size = 30,
    isCreatedByUser,
    button,
    model = '',
    endpoint,
    error,
    jailbreak,
    assistantName,
  } = props;

  const avatarSrc = useAvatar(user);
  const localize = useLocalize();

  if (isCreatedByUser) {
    const username = user?.name || user?.username || localize('com_nav_user');

    return (
      <div
        title={username}
        style={{
          width: size,
          height: size,
        }}
        className={cn('relative flex items-center justify-center', props.className ?? '')}
      >
        {!user?.avatar && !user?.username ? (
          <div
            style={{
              backgroundColor: 'rgb(121, 137, 255)',
              width: '20px',
              height: '20px',
              boxShadow: 'rgba(240, 246, 252, 0.1) 0px 0px 0px 1px',
            }}
            className="relative flex h-9 w-9 items-center justify-center rounded-sm p-1 text-white"
          >
            <UserIcon />
          </div>
        ) : (
          <img className="rounded-full" src={user?.avatar || avatarSrc} alt="avatar" />
        )}
      </div>
    );
  }

  const endpointIcons = {
    [EModelEndpoint.assistants]: {
      icon: props.iconURL ? (
        <div className="relative flex h-6 w-6 items-center justify-center">
          <div
            title={assistantName}
            style={{
              width: size,
              height: size,
            }}
            className={cn('overflow-hidden rounded-full', props.className ?? '')}
          >
            <img
              className="shadow-stroke h-full w-full object-cover"
              src={props.iconURL}
              alt={assistantName}
              style={{ height: '80', width: '80' }}
            />
          </div>
        </div>
      ) : (
        <div className="h-6 w-6">
          <div className="shadow-stroke flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
            <AssistantIcon className="h-2/3 w-2/3 text-gray-400" />
          </div>
        </div>
      ),
      name: endpoint,
    },
    [EModelEndpoint.azureOpenAI]: {
      icon: <AzureMinimalIcon size={size * 0.5555555555555556} />,
      bg: 'linear-gradient(0.375turn, #61bde2, #4389d0)',
      name: 'ChatGPT',
    },
    [EModelEndpoint.openAI]: {
      icon: <GPTIcon size={size * 0.5555555555555556} />,
      bg:
        typeof model === 'string' && model.toLowerCase().includes('gpt-4') ? '#AB68FF' : '#19C37D',
      name: 'ChatGPT',
    },
    [EModelEndpoint.gptPlugins]: {
      icon: <Plugin size={size * 0.7} />,
      bg: `rgba(69, 89, 164, ${button ? 0.75 : 1})`,
      name: 'Plugins',
    },
    [EModelEndpoint.google]: {
      icon: model?.toLowerCase()?.includes('code') ? (
        <CodeyIcon size={size * 0.75} />
      ) : model?.toLowerCase()?.includes('gemini') ? (
        <GeminiIcon size={size * 0.7} />
      ) : (
        <PaLMIcon size={size * 0.7} />
      ),
      name: model?.toLowerCase()?.includes('code')
        ? 'Codey'
        : model?.toLowerCase()?.includes('gemini')
          ? 'Gemini'
          : 'PaLM2',
    },
    [EModelEndpoint.anthropic]: {
      icon: <AnthropicIcon size={size * 0.5555555555555556} />,
      bg: '#d09a74',
      name: 'Claude',
    },
    [EModelEndpoint.bingAI]: {
      icon: jailbreak ? (
        <img src="/assets/bingai-jb.png" alt="Bing Icon" />
      ) : (
        <img src="/assets/bingai.png" alt="Sydney Icon" />
      ),
      name: jailbreak ? 'Sydney' : 'BingAI',
    },
    [EModelEndpoint.chatGPTBrowser]: {
      icon: <GPTIcon size={size * 0.5555555555555556} />,
      bg:
        typeof model === 'string' && model.toLowerCase().includes('gpt-4')
          ? '#AB68FF'
          : `rgba(0, 163, 255, ${button ? 0.75 : 1})`,
      name: 'ChatGPT',
    },
    [EModelEndpoint.custom]: {
      icon: <CustomMinimalIcon size={size * 0.7} />,
      name: 'Custom',
    },
    null: { icon: <GPTIcon size={size * 0.7} />, bg: 'grey', name: 'N/A' },
    default: {
      icon: (
        <div className="h-6 w-6">
          <div className="overflow-hidden rounded-full">
            <UnknownIcon
              iconURL={props.iconURL}
              endpoint={endpoint ?? ''}
              className="h-full w-full object-contain"
              context="message"
            />
          </div>
        </div>
      ),
      name: endpoint,
    },
  };

  const { icon, bg, name } =
    endpoint && endpointIcons[endpoint] ? endpointIcons[endpoint] : endpointIcons.default;

  if (endpoint === EModelEndpoint.assistants) {
    return icon;
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
        'relative flex h-9 w-9 items-center justify-center rounded-sm p-1 text-white',
        props.className || '',
      )}
    >
      {icon}
      {error && (
        <span className="absolute right-0 top-[20px] -mr-2 flex h-3 w-3 items-center justify-center rounded-full border border-white bg-red-500 text-[10px] text-white">
          !
        </span>
      )}
    </div>
  );
};

export default Icon;
