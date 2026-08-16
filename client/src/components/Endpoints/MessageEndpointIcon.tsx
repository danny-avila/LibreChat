import { memo } from 'react';
import { Feather } from 'lucide-react';
import { EModelEndpoint, isAssistantsEndpoint, alternateName } from 'librechat-data-provider';
import {
  Plugin,
  GPTIcon,
  PaLMIcon,
  CodeyIcon,
  GeminiIcon,
  BedrockIcon,
  AssistantIcon,
  AnthropicIcon,
  TooltipAnchor,
  AzureMinimalIcon,
  CustomMinimalIcon,
  pxToRem,
} from '@librechat/client';
import UnknownIcon from '~/hooks/Endpoint/UnknownIcon';
import { IconProps } from '~/common';
import { cn } from '~/utils';

type EndpointIcon = {
  icon: React.ReactNode | React.JSX.Element;
  bg?: string;
  name?: string | null;
};

function getOpenAIColor(_model: string | null | undefined) {
  const model = _model?.toLowerCase() ?? '';
  if (model && (/\b(o\d)\b/i.test(model) || /\bgpt-[5-9](?:\.\d+)?\b/i.test(model))) {
    return '#000000';
  }
  return model.includes('gpt-4') ? '#AB68FF' : '#19C37D';
}

function getGoogleIcon(model: string | null | undefined, size: number) {
  if (model?.toLowerCase().includes('code') === true) {
    return <CodeyIcon size={size * 0.75} className="h-[75%] w-[75%]" />;
  } else if (/gemini|learnlm|gemma/.test(model?.toLowerCase() ?? '')) {
    return <GeminiIcon size={size * 0.7} className="h-[70%] w-[70%]" />;
  } else {
    return <PaLMIcon size={size * 0.7} className="h-[70%] w-[70%]" />;
  }
}

function getGoogleModelName(model: string | null | undefined) {
  if (model?.toLowerCase().includes('code') === true) {
    return 'Codey';
  } else if (
    model?.toLowerCase().includes('gemini') === true ||
    model?.toLowerCase().includes('learnlm') === true
  ) {
    return 'Gemini';
  } else if (model?.toLowerCase().includes('gemma') === true) {
    return 'Gemma';
  } else {
    return 'PaLM2';
  }
}

const MessageEndpointIcon: React.FC<IconProps> = (props) => {
  const { error, iconURL = '', endpoint, size = 30, model = '', assistantName, agentName } = props;

  const assistantsIcon = {
    icon: iconURL ? (
      <div className="relative flex h-6 w-6 items-center justify-center">
        <TooltipAnchor
          description={assistantName ?? ''}
          style={{
            width: pxToRem(size),
            height: pxToRem(size),
          }}
          className={cn('overflow-hidden rounded-full', props.className ?? '')}
        >
          <img
            className="shadow-stroke h-full w-full object-cover"
            src={iconURL}
            alt={assistantName}
            style={{ height: '80', width: '80' }}
          />
        </TooltipAnchor>
      </div>
    ) : (
      <div className="h-6 w-6">
        <div className="shadow-stroke flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
          <AssistantIcon className="h-2/3 w-2/3 text-text-tertiary" />
        </div>
      </div>
    ),
    name: endpoint,
  };

  const agentsIcon = {
    icon: iconURL ? (
      <div className="relative flex h-6 w-6 items-center justify-center">
        <TooltipAnchor
          description={agentName ?? ''}
          style={{
            width: pxToRem(size),
            height: pxToRem(size),
          }}
          className={cn('overflow-hidden rounded-full', props.className ?? '')}
        >
          <img
            className="shadow-stroke h-full w-full object-cover"
            src={iconURL}
            alt={agentName}
            style={{ height: '80', width: '80' }}
          />
        </TooltipAnchor>
      </div>
    ) : (
      <div className="h-6 w-6">
        <div className="shadow-stroke flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
          <Feather className="h-2/3 w-2/3 text-text-tertiary" aria-hidden="true" />
        </div>
      </div>
    ),
    name: endpoint,
  };

  const endpointIcons: {
    [key: string]: EndpointIcon | undefined;
  } = {
    [EModelEndpoint.assistants]: assistantsIcon,
    [EModelEndpoint.agents]: agentsIcon,
    [EModelEndpoint.azureAssistants]: assistantsIcon,
    [EModelEndpoint.azureOpenAI]: {
      icon: <AzureMinimalIcon size={size * 0.5555555555555556} className="h-[55.56%] w-[55.56%]" />,
      bg: 'linear-gradient(0.375turn, #61bde2, #4389d0)',
      name: 'ChatGPT',
    },
    [EModelEndpoint.openAI]: {
      icon: <GPTIcon size={size * 0.5555555555555556} className="h-[55.56%] w-[55.56%]" />,
      bg: getOpenAIColor(model),
      name: 'ChatGPT',
    },
    [EModelEndpoint.google]: {
      icon: getGoogleIcon(model, size),
      name: getGoogleModelName(model),
    },
    [EModelEndpoint.anthropic]: {
      icon: <AnthropicIcon size={size * 0.5555555555555556} className="h-[55.56%] w-[55.56%]" />,
      bg: '#d09a74',
      name: 'Claude',
    },
    [EModelEndpoint.bedrock]: {
      icon: <BedrockIcon className="icon-xl text-white" />,
      bg: '#268672',
      name: alternateName[EModelEndpoint.bedrock],
    },
    [EModelEndpoint.custom]: {
      icon: <CustomMinimalIcon size={size * 0.7} className="h-[70%] w-[70%]" />,
      name: 'Custom',
    },
    null: {
      icon: <GPTIcon size={size * 0.7} className="h-[70%] w-[70%]" />,
      bg: 'grey',
      name: 'N/A',
    },
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
      name: endpoint,
    },
  };

  let { icon, bg, name } =
    endpoint != null && endpoint && endpointIcons[endpoint]
      ? (endpointIcons[endpoint] ?? {})
      : (endpointIcons.default as EndpointIcon);

  if (iconURL && endpointIcons[iconURL]) {
    ({ icon, bg, name } = endpointIcons[iconURL]);
  }

  if (isAssistantsEndpoint(endpoint)) {
    return icon;
  }

  const hasBackground = typeof bg === 'string' && bg.length > 0;

  return (
    <div
      title={name ?? ''}
      style={{
        background: bg != null ? bg || 'transparent' : 'transparent',
        width: pxToRem(size),
        height: pxToRem(size),
      }}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-sm',
        hasBackground ? 'text-white' : 'text-text-primary',
        props.className ?? '',
      )}
    >
      {icon}
      {error === true && (
        <span className="absolute right-0 top-[1.25rem] -mr-2 flex h-3 w-3 items-center justify-center rounded-full border border-white bg-status-error text-[0.625rem] text-white">
          !
        </span>
      )}
    </div>
  );
};

export default memo(MessageEndpointIcon);
