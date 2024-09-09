import { EModelEndpoint, alternateName } from 'librechat-data-provider';
import { BrainCircuit } from 'lucide-react';
import UnknownIcon from '~/components/Chat/Menus/Endpoints/UnknownIcon';
import {
  AzureMinimalIcon,
  OpenAIMinimalIcon,
  LightningIcon,
  MinimalPlugin,
  BingAIMinimalIcon,
  GoogleMinimalIcon,
  CustomMinimalIcon,
  AnthropicIcon,
  BedrockIcon,
  Sparkles,
} from '~/components/svg';
import { cn } from '~/utils';
import { IconProps } from '~/common';

const MinimalIcon: React.FC<IconProps> = (props) => {
  const { size = 30, iconClassName, error } = props;

  let endpoint = 'default'; // Default value for endpoint

  if (typeof props.endpoint === 'string') {
    endpoint = props.endpoint;
  }

  const endpointIcons = {
    [EModelEndpoint.azureOpenAI]: {
      icon: <AzureMinimalIcon className={iconClassName} />,
      name: props.chatGptLabel ?? 'ChatGPT',
    },
    [EModelEndpoint.openAI]: {
      icon: <OpenAIMinimalIcon className={iconClassName} />,
      name: props.chatGptLabel ?? 'ChatGPT',
    },
    [EModelEndpoint.gptPlugins]: { icon: <MinimalPlugin />, name: 'Plugins' },
    [EModelEndpoint.google]: { icon: <GoogleMinimalIcon />, name: props.modelLabel ?? 'Google' },
    [EModelEndpoint.anthropic]: {
      icon: <AnthropicIcon className="icon-md shrink-0 dark:text-white" />,
      name: props.modelLabel ?? 'Claude',
    },
    [EModelEndpoint.custom]: {
      icon: <CustomMinimalIcon />,
      name: 'Custom',
    },
    [EModelEndpoint.bingAI]: { icon: <BingAIMinimalIcon />, name: 'BingAI' },
    [EModelEndpoint.chatGPTBrowser]: { icon: <LightningIcon />, name: 'ChatGPT' },
    [EModelEndpoint.assistants]: { icon: <Sparkles className="icon-sm" />, name: 'Assistant' },
    [EModelEndpoint.azureAssistants]: { icon: <Sparkles className="icon-sm" />, name: 'Assistant' },
    [EModelEndpoint.agents]: {
      icon: <BrainCircuit className="icon-sm" />,
      name: props.modelLabel ?? alternateName[EModelEndpoint.agents],
    },
    [EModelEndpoint.bedrock]: {
      icon: <BedrockIcon className="icon-xl text-text-primary" />,
      name: props.modelLabel ?? alternateName[EModelEndpoint.bedrock],
    },
    default: {
      icon: (
        <UnknownIcon
          iconURL={props.iconURL}
          endpoint={endpoint}
          className="icon-sm"
          context="nav"
        />
      ),
      name: endpoint,
    },
  };

  let { icon, name } = endpointIcons[endpoint] ?? endpointIcons.default;
  if (props.iconURL && endpointIcons[props.iconURL]) {
    ({ icon, name } = endpointIcons[props.iconURL]);
  }

  return (
    <div
      data-testid="convo-icon"
      title={name}
      style={{
        width: size,
        height: size,
      }}
      className={cn(
        'relative flex items-center justify-center rounded-sm text-black dark:text-white',
        props.className ?? '',
      )}
    >
      {icon}
      {error === true && (
        <span className="absolute right-0 top-[20px] -mr-2 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-red-500 text-[10px] text-black dark:text-white">
          !
        </span>
      )}
    </div>
  );
};

export default MinimalIcon;
