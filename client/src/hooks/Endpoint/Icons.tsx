import { Feather } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import {
  Sparkles,
  BedrockIcon,
  AssistantIcon,
  AzureMinimalIcon,
  CustomMinimalIcon,
} from '@librechat/client';
import type { IconMapProps, AgentIconMapProps, IconsRecord } from '~/common';
import {
  OpenAIEditorIcon,
  AnthropicEditorIcon,
  GoogleEditorIcon,
  FrenchAlpacaEditorIcon,
} from '~/components/svg/editors/EditorIcons';
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

const Bedrock = ({ className = '' }: IconMapProps) => {
  return <BedrockIcon className={cn(className, 'h-full w-full')} />;
};

// TODO: migrer "French Models" / "Modèles français" vers iconURL dans librechat.yaml
// quand l'archi le permettra. Hardcode actuel pour matcher le custom endpoint Vermeer
// avant et après la traduction du nom côté DevOps.
export const icons: IconsRecord = {
  [EModelEndpoint.azureOpenAI]: AzureMinimalIcon,
  [EModelEndpoint.openAI]: OpenAIEditorIcon,
  [EModelEndpoint.anthropic]: AnthropicEditorIcon,
  [EModelEndpoint.google]: GoogleEditorIcon,
  [EModelEndpoint.custom]: CustomMinimalIcon,
  [EModelEndpoint.assistants]: AssistantAvatar,
  [EModelEndpoint.azureAssistants]: AssistantAvatar,
  [EModelEndpoint.agents]: AgentAvatar,
  [EModelEndpoint.bedrock]: Bedrock,
  'French Models': FrenchAlpacaEditorIcon,
  'Modèles français': FrenchAlpacaEditorIcon,
  unknown: UnknownIcon,
};
