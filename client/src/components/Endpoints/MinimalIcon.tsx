import { Feather } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import { Sparkles } from '@librechat/client';
import UnknownIcon from '~/hooks/Endpoint/UnknownIcon';
import {
  ASSISTANT_DISPLAY_NAME,
  NeutralAssistantIcon,
  getAssistantDisplayName,
  shouldWhiteLabelEndpoint,
} from '~/utils/branding';
import { IconProps } from '~/common';
import { cn } from '~/utils';

const MinimalIcon: React.FC<IconProps> = (props) => {
  const { size = 30, iconURL = '', iconClassName, error } = props;

  let endpoint = 'default';

  if (typeof props.endpoint === 'string') {
    endpoint = props.endpoint;
  }

  const displayName = getAssistantDisplayName(props.modelLabel ?? props.chatGptLabel);

  const endpointIcons = {
    [EModelEndpoint.azureOpenAI]: {
      icon: <NeutralAssistantIcon className={iconClassName} size={size} />,
      name: displayName,
    },
    [EModelEndpoint.openAI]: {
      icon: <NeutralAssistantIcon className={iconClassName} size={size} />,
      name: displayName,
    },
    [EModelEndpoint.google]: {
      icon: <NeutralAssistantIcon className={iconClassName} size={size} />,
      name: displayName,
    },
    [EModelEndpoint.anthropic]: {
      icon: <NeutralAssistantIcon className={iconClassName} size={size} />,
      name: displayName,
    },
    [EModelEndpoint.custom]: {
      icon: <NeutralAssistantIcon className={iconClassName} size={size} />,
      name: displayName,
    },
    [EModelEndpoint.assistants]: { icon: <Sparkles className="icon-sm" />, name: 'Assistant' },
    [EModelEndpoint.azureAssistants]: { icon: <Sparkles className="icon-sm" />, name: 'Assistant' },
    [EModelEndpoint.agents]: {
      icon: <Feather className="icon-sm" aria-hidden="true" />,
      name: props.modelLabel?.trim() || ASSISTANT_DISPLAY_NAME,
    },
    [EModelEndpoint.bedrock]: {
      icon: <NeutralAssistantIcon className={iconClassName} size={size} />,
      name: displayName,
    },
    default: {
      icon: <UnknownIcon iconURL={iconURL} endpoint={endpoint} className="icon-sm" context="nav" />,
      name: ASSISTANT_DISPLAY_NAME,
    },
  };

  let { icon, name } = endpointIcons[endpoint] ?? endpointIcons.default;
  if (iconURL && endpointIcons[iconURL] != null) {
    ({ icon, name } = endpointIcons[iconURL]);
  }

  if (shouldWhiteLabelEndpoint(endpoint)) {
    ({ icon, name } = {
      icon: <NeutralAssistantIcon className={iconClassName} size={size} />,
      name: displayName,
    });
  }

  return (
    <div
      data-testid="convo-icon"
      title={name}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
      }}
      className={cn(
        'relative flex items-center justify-center rounded-sm text-text-secondary',
        props.className ?? '',
      )}
    >
      {icon}
      {error === true && (
        <span className="absolute right-0 top-[20px] -mr-2 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-red-500 text-[10px] text-text-secondary">
          !
        </span>
      )}
    </div>
  );
};

export default MinimalIcon;
