import { Feather } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import {
  GPTIcon,
  Sparkles,
  BedrockIcon,
  AssistantIcon,
  AnthropicIcon,
  AzureMinimalIcon,
  GoogleMinimalIcon,
  CustomMinimalIcon,
} from '@librechat/client';
import type { IconMapProps, AgentIconMapProps, IconsRecord } from '~/common';
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
        className="bg-token-surface-secondary h-full w-full rounded-full object-cover dark:bg-surface-tertiary"
        alt={assistantName}
        width="80"
        height="80"
      />
    );
  } else if (assistantName) {
    return <AssistantIcon className={cn('text-text-secondary', className)} size={size} />;
  }

  return <Sparkles className={cn(context === 'landing' ? 'icon-2xl' : '', className)} />;
};

const AgentAvatar = ({ className = '', avatar = '', agentName, size }: AgentIconMapProps) => {
  if (agentName != null && agentName && avatar) {
    return (
      <img
        src={avatar}
        className="bg-token-surface-secondary h-full w-full rounded-full object-cover dark:bg-surface-tertiary"
        alt={agentName}
        width="80"
        height="80"
      />
    );
  }

  return <Feather className={cn(agentName === '' ? 'icon-2xl' : '', className)} size={size} />;
};

const Bedrock = ({ className = '' }: IconMapProps) => {
  return <BedrockIcon className={cn(className, 'h-full w-full')} />;
};

export const icons: IconsRecord = {
  [EModelEndpoint.azureOpenAI]: AzureMinimalIcon,
  [EModelEndpoint.openAI]: GPTIcon,
  [EModelEndpoint.anthropic]: AnthropicIcon,
  [EModelEndpoint.google]: GoogleMinimalIcon,
  [EModelEndpoint.custom]: CustomMinimalIcon,
  [EModelEndpoint.assistants]: AssistantAvatar,
  [EModelEndpoint.azureAssistants]: AssistantAvatar,
  [EModelEndpoint.agents]: AgentAvatar,
  [EModelEndpoint.bedrock]: Bedrock,
  unknown: UnknownIcon,
};
