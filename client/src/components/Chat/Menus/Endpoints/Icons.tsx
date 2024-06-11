import { EModelEndpoint } from 'librechat-data-provider';
import type { IconMapProps } from '~/common';
import {
  MinimalPlugin,
  GPTIcon,
  AnthropicIcon,
  AzureMinimalIcon,
  BingAIMinimalIcon,
  GoogleMinimalIcon,
  CustomMinimalIcon,
  AssistantIcon,
  LightningIcon,
  Sparkles,
} from '~/components/svg';
import UnknownIcon from './UnknownIcon';
import { cn } from '~/utils';

const AssistantAvatar = ({ className = '', assistantName, avatar, size }: IconMapProps) => {
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

  return <Sparkles className={cn(assistantName === '' ? 'icon-2xl' : '', className)} />;
};

export const icons = {
  [EModelEndpoint.azureOpenAI]: AzureMinimalIcon,
  [EModelEndpoint.openAI]: GPTIcon,
  [EModelEndpoint.gptPlugins]: MinimalPlugin,
  [EModelEndpoint.anthropic]: AnthropicIcon,
  [EModelEndpoint.chatGPTBrowser]: LightningIcon,
  [EModelEndpoint.google]: GoogleMinimalIcon,
  [EModelEndpoint.bingAI]: BingAIMinimalIcon,
  [EModelEndpoint.custom]: CustomMinimalIcon,
  [EModelEndpoint.assistants]: AssistantAvatar,
  [EModelEndpoint.azureAssistants]: AssistantAvatar,
  unknown: UnknownIcon,
};
