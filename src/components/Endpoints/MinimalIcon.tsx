import { EModelEndpoint } from 'librechat-data-provider';
import UnknownIcon from '~/components/Chat/Menus/Endpoints/UnknownIcon';
import {
  AzureMinimalIcon,
  OpenAIMinimalIcon,
  LightningIcon,
  PluginMinimalIcon,
  BingAIMinimalIcon,
  GoogleMinimalIcon,
  CustomMinimalIcon,
  AnthropicIcon,
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
    [EModelEndpoint.azureOpenAI]: {
      icon: <AzureMinimalIcon />,
      name: props.chatGptLabel || 'ChatGPT',
    },
    [EModelEndpoint.openAI]: { icon: <OpenAIMinimalIcon />, name: props.chatGptLabel || 'ChatGPT' },
    [EModelEndpoint.gptPlugins]: { icon: <PluginMinimalIcon />, name: 'Plugins' },
    [EModelEndpoint.google]: { icon: <GoogleMinimalIcon />, name: props.modelLabel || 'Google' },
    [EModelEndpoint.anthropic]: {
      icon: <AnthropicIcon className="icon-md shrink-0 dark:text-white" />,
      name: props.modelLabel || 'Claude',
    },
    [EModelEndpoint.custom]: {
      icon: <CustomMinimalIcon />,
      name: 'Custom',
    },
    [EModelEndpoint.bingAI]: { icon: <BingAIMinimalIcon />, name: 'BingAI' },
    [EModelEndpoint.chatGPTBrowser]: { icon: <LightningIcon />, name: 'ChatGPT' },
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

  const { icon, name } = endpointIcons[endpoint] ?? endpointIcons.default;

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
