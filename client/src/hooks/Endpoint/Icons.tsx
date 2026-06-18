import { Feather } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import {
  GPTIcon,
  AnthropicIcon,
  AzureMinimalIcon,
  GoogleMinimalIcon,
  CustomMinimalIcon,
} from '@librechat/client';
import type { AgentIconMapProps, IconsRecord } from '~/common';
import UnknownIcon from './UnknownIcon';
import { cn } from '~/utils';

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

export const icons: IconsRecord = {
  [EModelEndpoint.azureOpenAI]: AzureMinimalIcon,
  [EModelEndpoint.openAI]: GPTIcon,
  [EModelEndpoint.anthropic]: AnthropicIcon,
  [EModelEndpoint.google]: GoogleMinimalIcon,
  [EModelEndpoint.custom]: CustomMinimalIcon,
  [EModelEndpoint.agents]: AgentAvatar,
  unknown: UnknownIcon,
};
