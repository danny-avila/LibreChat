import { Feather } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import { Sparkles, AssistantIcon, CustomMinimalIcon } from '@librechat/client';
import type { IconMapProps, AgentIconMapProps, IconsRecord } from '~/common';
import { NeutralAssistantIcon } from '~/utils/branding';
import UnknownIcon from './UnknownIcon';
import { cn } from '~/utils';

const AssistantAvatar = ({
  className = '',
  assistantName = '',
  avatar = '',
  context,
  size,
}: IconMapProps) => {
  if (assistantName && avatar) {
    return (
      <img
        src={avatar}
        className="bg-token-surface-secondary dark:bg-token-surface-tertiary h-full w-full rounded-full object-cover"
        alt={assistantName}
        width="80"
        height="80"
      />
    );
  } else if (assistantName) {
    return <AssistantIcon className={cn('text-token-secondary', className)} size={size} />;
  }

  return <Sparkles className={cn(context === 'landing' ? 'icon-2xl' : '', className)} />;
};

const AgentAvatar = ({ className = '', avatar = '', agentName, size }: AgentIconMapProps) => {
  if (agentName != null && agentName && avatar) {
    return (
      <img
        src={avatar}
        className="bg-token-surface-secondary dark:bg-token-surface-tertiary h-full w-full rounded-full object-cover"
        alt={agentName}
        width="80"
        height="80"
      />
    );
  }

  return <Feather className={cn(agentName === '' ? 'icon-2xl' : '', className)} size={size} />;
};

const NeutralEndpointIcon = ({ className = '', size }: IconMapProps) => (
  <NeutralAssistantIcon className={cn(className, 'h-full w-full')} size={size} />
);

export const icons: IconsRecord = {
  [EModelEndpoint.azureOpenAI]: NeutralEndpointIcon,
  [EModelEndpoint.openAI]: NeutralEndpointIcon,
  [EModelEndpoint.anthropic]: NeutralEndpointIcon,
  [EModelEndpoint.google]: NeutralEndpointIcon,
  [EModelEndpoint.custom]: CustomMinimalIcon,
  [EModelEndpoint.assistants]: AssistantAvatar,
  [EModelEndpoint.azureAssistants]: AssistantAvatar,
  [EModelEndpoint.agents]: AgentAvatar,
  [EModelEndpoint.bedrock]: NeutralEndpointIcon,
  unknown: UnknownIcon,
};
