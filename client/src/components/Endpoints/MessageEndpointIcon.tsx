import { memo } from 'react';
import { Feather } from 'lucide-react';
import { EModelEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import { AssistantIcon } from '@librechat/client';
import UnknownIcon from '~/hooks/Endpoint/UnknownIcon';
import {
  ASSISTANT_DISPLAY_NAME,
  NEUTRAL_ASSISTANT_ICON_BG,
  NeutralAssistantIcon,
  shouldWhiteLabelEndpoint,
} from '~/utils/branding';
import { IconProps } from '~/common';
import { cn } from '~/utils';

type EndpointIcon = {
  icon: React.ReactNode | React.JSX.Element;
  bg?: string;
  name?: string | null;
};

const neutralProviderIcon = (size: number): EndpointIcon => ({
  icon: <NeutralAssistantIcon size={size * 0.6} className="text-white" />,
  bg: NEUTRAL_ASSISTANT_ICON_BG,
  name: ASSISTANT_DISPLAY_NAME,
});

const MessageEndpointIcon: React.FC<IconProps> = (props) => {
  const { error, iconURL = '', endpoint, size = 30, assistantName, agentName } = props;

  const assistantsIcon = {
    icon: iconURL ? (
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
            src={iconURL}
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
    name: assistantName || ASSISTANT_DISPLAY_NAME,
  };

  const agentsIcon = {
    icon: iconURL ? (
      <div className="relative flex h-6 w-6 items-center justify-center">
        <div
          title={agentName}
          style={{
            width: size,
            height: size,
          }}
          className={cn('overflow-hidden rounded-full', props.className ?? '')}
        >
          <img
            className="shadow-stroke h-full w-full object-cover"
            src={iconURL}
            alt={agentName}
            style={{ height: '80', width: '80' }}
          />
        </div>
      </div>
    ) : (
      <div className="h-6 w-6">
        <div className="shadow-stroke flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
          <Feather className="h-2/3 w-2/3 text-gray-400" aria-hidden="true" />
        </div>
      </div>
    ),
    name: agentName || ASSISTANT_DISPLAY_NAME,
  };

  const endpointIcons: {
    [key: string]: EndpointIcon | undefined;
  } = {
    [EModelEndpoint.assistants]: assistantsIcon,
    [EModelEndpoint.agents]: agentsIcon,
    [EModelEndpoint.azureAssistants]: assistantsIcon,
    [EModelEndpoint.azureOpenAI]: neutralProviderIcon(size),
    [EModelEndpoint.openAI]: neutralProviderIcon(size),
    [EModelEndpoint.google]: neutralProviderIcon(size),
    [EModelEndpoint.anthropic]: neutralProviderIcon(size),
    [EModelEndpoint.bedrock]: neutralProviderIcon(size),
    [EModelEndpoint.custom]: neutralProviderIcon(size),
    null: neutralProviderIcon(size),
    default: {
      icon: (
        <div className="h-6 w-6">
          <div className="overflow-hidden rounded-full">
            <UnknownIcon
              iconURL={iconURL}
              endpoint={endpoint ?? ''}
              className="h-full w-full object-contain"
              context="message"
            />
          </div>
        </div>
      ),
      name: ASSISTANT_DISPLAY_NAME,
    },
  };

  let { icon, bg, name } =
    endpoint != null && endpoint && endpointIcons[endpoint]
      ? (endpointIcons[endpoint] ?? {})
      : (endpointIcons.default as EndpointIcon);

  if (iconURL && endpointIcons[iconURL]) {
    ({ icon, bg, name } = endpointIcons[iconURL]);
  }

  if (shouldWhiteLabelEndpoint(endpoint) && !isAssistantsEndpoint(endpoint)) {
    ({ icon, bg, name } = neutralProviderIcon(size));
  }

  if (isAssistantsEndpoint(endpoint)) {
    return icon;
  }

  return (
    <div
      title={name ?? ''}
      style={{
        background: bg != null ? bg || 'transparent' : 'transparent',
        width: size,
        height: size,
      }}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-sm p-1 text-white',
        props.className ?? '',
      )}
    >
      {icon}
      {error === true && (
        <span className="absolute right-0 top-[20px] -mr-2 flex h-3 w-3 items-center justify-center rounded-full border border-white bg-red-500 text-[10px] text-white">
          !
        </span>
      )}
    </div>
  );
};

export default memo(MessageEndpointIcon);
