import { EModelEndpoint } from 'librechat-data-provider';
import UnknownIcon from '~/components/Chat/Menus/Endpoints/UnknownIcon';
import {
  Plugin,
  GPTIcon,
  AnthropicIcon,
  AzureMinimalIcon,
  CustomMinimalIcon,
  PaLMIcon,
  CodeyIcon,
  GeminiIcon,
} from '~/components/svg';
import { useAuthContext } from '~/hooks/AuthContext';
import { IconProps } from '~/common';
import { cn } from '~/utils';

const Icon: React.FC<IconProps> = (props) => {
  const { user } = useAuthContext();
  const { size = 30, isCreatedByUser, button, model = '', endpoint, jailbreak } = props;

  if (isCreatedByUser) {
    const username = user?.name || 'User';

    return (
      <div
        title={username}
        style={{
          width: size,
          height: size,
        }}
        className={cn('relative flex items-center justify-center', props.className ?? '')}
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
    const endpointIcons = {
      [EModelEndpoint.azureOpenAI]: {
        icon: <AzureMinimalIcon size={size * 0.5555555555555556} />,
        bg: 'linear-gradient(0.375turn, #61bde2, #4389d0)',
        name: 'ChatGPT',
      },
      [EModelEndpoint.openAI]: {
        icon: <GPTIcon size={size * 0.5555555555555556} />,
        bg:
          typeof model === 'string' && model.toLowerCase().includes('gpt-4')
            ? '#AB68FF'
            : '#19C37D',
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
          <UnknownIcon
            iconURL={props.iconURL}
            endpoint={endpoint ?? ''}
            className="icon-sm"
            context="message"
          />
        ),
        name: endpoint,
      },
    };

    const { icon, bg, name } =
      endpoint && endpointIcons[endpoint] ? endpointIcons[endpoint] : endpointIcons.default;

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
        {/* {error && (
          <span className="absolute right-0 top-[20px] -mr-2 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-red-500 text-[10px] text-white">
            !
          </span>
        )} */}
      </div>
    );
  }
};

export default Icon;
