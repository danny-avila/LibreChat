import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import {
  Brain,
  Image,
  Music,
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
import {
  useChatContext,
  useAgentsMapContext,
  useAssistantsMapContext,
  useChatFormContext,
} from '~/Providers';
import { useGetAssistantDocsQuery, useGetEndpointsQuery } from '~/data-provider';
import { getIconEndpoint, getEntity } from '~/utils';
import { useSubmitMessage, useLocalize } from '~/hooks';

type TranslationKey = Parameters<ReturnType<typeof useLocalize>>[0];

type DefaultStarter = {
  labelKey: TranslationKey;
  promptKey: TranslationKey;
  icon: LucideIcon;
  suggestionKeys: [TranslationKey, TranslationKey, TranslationKey, TranslationKey];
};

const DEFAULT_STARTERS: DefaultStarter[] = [
  {
    labelKey: 'com_ui_starter_help_write',
    promptKey: 'com_ui_starter_help_write_prompt',
    icon: PenLine,
    suggestionKeys: [
      'com_ui_starter_help_write_s1',
      'com_ui_starter_help_write_s2',
      'com_ui_starter_help_write_s3',
      'com_ui_starter_help_write_s4',
    ],
  },
  {
    labelKey: 'com_ui_starter_learn_about',
    promptKey: 'com_ui_starter_learn_about_prompt',
    icon: BookOpen,
    suggestionKeys: [
      'com_ui_starter_learn_about_s1',
      'com_ui_starter_learn_about_s2',
      'com_ui_starter_learn_about_s3',
      'com_ui_starter_learn_about_s4',
    ],
  },
  {
    labelKey: 'com_ui_starter_analyze_image',
    promptKey: 'com_ui_starter_analyze_image_prompt',
    icon: ScanSearch,
    suggestionKeys: [
      'com_ui_starter_analyze_image_s1',
      'com_ui_starter_analyze_image_s2',
      'com_ui_starter_analyze_image_s3',
      'com_ui_starter_analyze_image_s4',
    ],
  },
  {
    labelKey: 'com_ui_starter_generate_lyrics',
    promptKey: 'com_ui_starter_generate_lyrics_prompt',
    icon: Music,
    suggestionKeys: [
      'com_ui_starter_generate_lyrics_s1',
      'com_ui_starter_generate_lyrics_s2',
      'com_ui_starter_generate_lyrics_s3',
      'com_ui_starter_generate_lyrics_s4',
    ],
  },
  {
    labelKey: 'com_ui_starter_summarize_text',
    promptKey: 'com_ui_starter_summarize_text_prompt',
    icon: AlignLeft,
    suggestionKeys: [
      'com_ui_starter_summarize_text_s1',
      'com_ui_starter_summarize_text_s2',
      'com_ui_starter_summarize_text_s3',
      'com_ui_starter_summarize_text_s4',
    ],
  },
  {
    labelKey: 'com_ui_starter_analyze_data',
    promptKey: 'com_ui_starter_analyze_data_prompt',
    icon: TrendingUp,
    suggestionKeys: [
      'com_ui_starter_analyze_data_s1',
      'com_ui_starter_analyze_data_s2',
      'com_ui_starter_analyze_data_s3',
      'com_ui_starter_analyze_data_s4',
    ],
  },
  {
    labelKey: 'com_ui_starter_brainstorm',
    promptKey: 'com_ui_starter_brainstorm_prompt',
    icon: Brain,
    suggestionKeys: [
      'com_ui_starter_brainstorm_s1',
      'com_ui_starter_brainstorm_s2',
      'com_ui_starter_brainstorm_s3',
      'com_ui_starter_brainstorm_s4',
    ],
  },
  {
    labelKey: 'com_ui_starter_improve_writing',
    promptKey: 'com_ui_starter_improve_writing_prompt',
    icon: Heading,
    suggestionKeys: [
      'com_ui_starter_improve_writing_s1',
      'com_ui_starter_improve_writing_s2',
      'com_ui_starter_improve_writing_s3',
      'com_ui_starter_improve_writing_s4',
    ],
  },
  {
    labelKey: 'com_ui_starter_translate',
    promptKey: 'com_ui_starter_translate_prompt',
    icon: Languages,
    suggestionKeys: [
      'com_ui_starter_translate_s1',
      'com_ui_starter_translate_s2',
      'com_ui_starter_translate_s3',
      'com_ui_starter_translate_s4',
    ],
  },
  {
    labelKey: 'com_ui_starter_generate_images',
    promptKey: 'com_ui_starter_generate_images_prompt',
    icon: Image,
    suggestionKeys: [
      'com_ui_starter_generate_images_s1',
      'com_ui_starter_generate_images_s2',
      'com_ui_starter_generate_images_s3',
      'com_ui_starter_generate_images_s4',
    ],
  },
  {
    labelKey: 'com_ui_starter_generate_ideas',
    promptKey: 'com_ui_starter_generate_ideas_prompt',
    icon: Lightbulb,
    suggestionKeys: [
      'com_ui_starter_generate_ideas_s1',
      'com_ui_starter_generate_ideas_s2',
      'com_ui_starter_generate_ideas_s3',
      'com_ui_starter_generate_ideas_s4',
    ],
  },
];

interface SuggestionRowProps {
  text: string;
  prompt: string;
  onSelect: (text: string) => void;
}

const SuggestionRow = ({ text, prompt, onSelect }: SuggestionRowProps) => {
  const trimmedPrompt = prompt.trimEnd();
  const startsWithPrompt = text.startsWith(trimmedPrompt);
  const head = startsWithPrompt ? trimmedPrompt : '';
  const tail = startsWithPrompt ? text.slice(trimmedPrompt.length) : text;
  return (
    <button
      type="button"
      onClick={() => onSelect(text)}
      className="block w-full border-b border-border-light px-2 py-3 text-left text-[15px] last:border-b-0 hover:bg-surface-tertiary"
    >
      {head && <span className="font-medium text-text-primary">{head}</span>}
      <span className="text-text-tertiary">{tail}</span>
    </button>
  );
};

const ConversationStarters = () => {
  const localize = useLocalize();
  const { conversation } = useChatContext();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const [activeKey, setActiveKey] = useState<TranslationKey | null>(null);
  const suggestionContainerRef = useRef<HTMLDivElement | null>(null);

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

  const activeStarter = useMemo(
    () => DEFAULT_STARTERS.find((s) => s.labelKey === activeKey) ?? null,
    [activeKey],
  );

  const handleStarterClick = useCallback(
    (s: DefaultStarter) => {
      fillInput(localize(s.promptKey));
      setActiveKey(s.labelKey);
    },
    [fillInput, localize],
  );

  const handleSuggestionClick = useCallback(
    (text: string) => {
      fillInput(text);
      setActiveKey(null);
    },
    [fillInput],
  );

  useEffect(() => {
    if (!activeStarter) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !suggestionContainerRef.current?.contains(target)) {
        setActiveKey(null);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [activeStarter]);

  if (conversation_starters.length) {
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
  }

  if (activeStarter) {
    return (
      <div ref={suggestionContainerRef} className="mt-3 w-full px-4">
        <div className="flex flex-col">
          {activeStarter.suggestionKeys.map((key) => (
            <SuggestionRow
              key={key}
              text={localize(key)}
              prompt={localize(activeStarter.promptKey)}
              onSelect={handleSuggestionClick}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ScrollArea.Root className="mt-8 w-full px-4" type="always">
      <ScrollArea.Viewport className="w-full">
        <div className="flex flex-nowrap gap-2 pb-3">
          {DEFAULT_STARTERS.map((s) => (
            <button
              key={s.labelKey}
              onClick={() => handleStarterClick(s)}
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
};

export default ConversationStarters;
