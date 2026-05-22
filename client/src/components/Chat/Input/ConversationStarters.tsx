import { useMemo, useCallback } from 'react';
import {
  Brain,
  Image,
  PenLine,
  Heading,
  BookOpen,
  Languages,
  AlignLeft,
  Lightbulb,
  ScanSearch,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { EModelEndpoint, Constants } from 'librechat-data-provider';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext, useChatFormContext } from '~/Providers';
import { useGetAssistantDocsQuery, useGetEndpointsQuery } from '~/data-provider';
import { getIconEndpoint, getEntity } from '~/utils';
import { useSubmitMessage, useLocalize } from '~/hooks';

type TranslationKey = Parameters<ReturnType<typeof useLocalize>>[0];

const DEFAULT_STARTERS: { labelKey: TranslationKey; prompt: string; icon: LucideIcon }[] = [
  { labelKey: 'com_ui_starter_help_write', prompt: 'Help me write: ', icon: PenLine },
  { labelKey: 'com_ui_starter_learn_about', prompt: 'Tell me about: ', icon: BookOpen },
  { labelKey: 'com_ui_starter_analyze_image', prompt: 'Analyze this image: ', icon: ScanSearch },
  { labelKey: 'com_ui_starter_summarize_text', prompt: 'Summarize this text: ', icon: AlignLeft },
  { labelKey: 'com_ui_starter_analyze_data', prompt: 'Analyze this data: ', icon: TrendingUp },
  { labelKey: 'com_ui_starter_brainstorm', prompt: 'Brainstorm ideas for: ', icon: Brain },
  { labelKey: 'com_ui_starter_improve_writing', prompt: 'Improve this writing: ', icon: Heading },
  { labelKey: 'com_ui_starter_translate', prompt: 'Translate to English: ', icon: Languages },
  { labelKey: 'com_ui_starter_generate_images', prompt: 'Generate an image of: ', icon: Image },
  { labelKey: 'com_ui_starter_generate_ideas', prompt: 'Generate creative ideas for: ', icon: Lightbulb },
];

const ConversationStarters = () => {
  const localize = useLocalize();
  const { conversation } = useChatContext();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();

  const endpointType = useMemo(() => {
    let ep = conversation?.endpoint ?? '';
    if (ep === EModelEndpoint.azureOpenAI) {
      ep = EModelEndpoint.openAI;
    }
    return getIconEndpoint({
      endpointsConfig,
      iconURL: conversation?.iconURL,
      endpoint: ep,
    });
  }, [conversation?.endpoint, conversation?.iconURL, endpointsConfig]);

  const { data: documentsMap = new Map() } = useGetAssistantDocsQuery(endpointType, {
    select: (data) => new Map(data.map((dbA) => [dbA.assistant_id, dbA])),
  });

  const { entity, isAgent } = getEntity({
    endpoint: endpointType,
    agentsMap,
    assistantMap,
    agent_id: conversation?.agent_id,
    assistant_id: conversation?.assistant_id,
  });

  const conversation_starters = useMemo(() => {
    if (entity?.conversation_starters?.length) {
      return entity.conversation_starters;
    }

    if (isAgent) {
      return [];
    }

    return documentsMap.get(entity?.id ?? '')?.conversation_starters ?? [];
  }, [documentsMap, isAgent, entity]);

  const { setValue } = useChatFormContext();
  const fillInput = useCallback((prompt: string) => setValue('text', prompt), [setValue]);

  const { submitMessage } = useSubmitMessage();
  const sendConversationStarter = useCallback(
    (text: string) => submitMessage({ text }),
    [submitMessage],
  );

  if (!conversation_starters.length) {
    return (
      <ScrollArea.Root className="mt-8 w-full px-4" type="always">
        <ScrollArea.Viewport className="w-full">
          <div className="flex flex-nowrap gap-2 pb-3">
            {DEFAULT_STARTERS.map((s) => (
              <button
                key={s.labelKey}
                onClick={() => fillInput(s.prompt)}
                className="flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-medium px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-tertiary"
              >
                <s.icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                {localize(s.labelKey)}
              </button>
            ))}
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar
          orientation="horizontal"
          className="flex h-1.5 touch-none select-none flex-col bg-surface-tertiary p-px"
        >
          <ScrollArea.Thumb className="relative flex-1 rounded-full bg-border-heavy before:absolute before:left-1/2 before:top-1/2 before:h-full before:min-h-[44px] before:w-full before:min-w-[44px] before:-translate-x-1/2 before:-translate-y-1/2" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    );
  }

  return (
    <div className="mt-8 flex flex-wrap justify-center gap-3 px-4">
      {conversation_starters
        .slice(0, Constants.MAX_CONVO_STARTERS)
        .map((text: string, index: number) => (
          <button
            key={index}
            onClick={() => sendConversationStarter(text)}
            className="relative flex w-40 cursor-pointer flex-col gap-2 rounded-2xl border border-border-medium px-3 pb-4 pt-3 text-start align-top text-[15px] shadow-[0_0_2px_0_rgba(0,0,0,0.05),0_4px_6px_0_rgba(0,0,0,0.02)] transition-colors duration-300 ease-in-out fade-in hover:bg-surface-tertiary"
          >
            <p className="break-word line-clamp-3 overflow-hidden text-balance break-all text-text-secondary">
              {text}
            </p>
          </button>
        ))}
    </div>
  );
};

export default ConversationStarters;
