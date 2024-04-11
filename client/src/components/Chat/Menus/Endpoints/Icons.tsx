import { EModelEndpoint } from 'librechat-data-provider';
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

export const icons = {
  [EModelEndpoint.azureOpenAI]: AzureMinimalIcon,
  [EModelEndpoint.openAI]: GPTIcon,
  [EModelEndpoint.gptPlugins]: MinimalPlugin,
  [EModelEndpoint.anthropic]: AnthropicIcon,
  [EModelEndpoint.chatGPTBrowser]: LightningIcon,
  [EModelEndpoint.google]: GoogleMinimalIcon,
  [EModelEndpoint.bingAI]: BingAIMinimalIcon,
  [EModelEndpoint.custom]: CustomMinimalIcon,
  [EModelEndpoint.assistants]: ({
    className = '',
    assistantName,
    avatar,
    size,
  }: {
    className?: string;
    assistantName?: string;
    avatar?: string;
    size?: number;
  }) => {
    if (assistantName && avatar) {
      return (
        <img
          src={avatar}
          className="bg-token-surface-secondary dark:bg-token-surface-tertiary h-full w-full"
          alt={assistantName}
          width="80"
          height="80"
        />
      );
    } else if (assistantName) {
      return <AssistantIcon className={cn('text-token-secondary', className)} size={size} />;
    }

    return <Sparkles className={cn(assistantName === '' ? 'icon-2xl' : '', className)} />;
  },
  unknown: UnknownIcon,
};
