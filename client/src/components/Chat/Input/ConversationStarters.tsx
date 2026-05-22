import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumbStyle, setThumbStyle] = useState({ left: '0%', width: '100%' });
  const dragRef = useRef<{ startX: number; startScrollLeft: number } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      if (scrollWidth <= clientWidth) {
        setThumbStyle({ left: '0%', width: '100%' });
        return;
      }
      const thumbWidth = Math.max((clientWidth / scrollWidth) * 100, 10);
      const thumbLeft = (scrollLeft / (scrollWidth - clientWidth)) * (100 - thumbWidth);
      setThumbStyle({ left: `${thumbLeft}%`, width: `${thumbWidth}%` });
    };
    update();
    el.addEventListener('scroll', update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  const handleThumbMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    dragRef.current = { startX: e.clientX, startScrollLeft: el.scrollLeft };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) {
        return;
      }
      const track = trackRef.current;
      if (!track) {
        return;
      }
      const { scrollWidth, clientWidth } = el;
      const trackWidth = track.clientWidth;
      const thumbWidth = Math.max((clientWidth / scrollWidth) * 100, 10);
      const scrollableTrack = trackWidth * (1 - thumbWidth / 100);
      const scrollableContent = scrollWidth - clientWidth;
      const dx = ev.clientX - dragRef.current.startX;
      el.scrollLeft = dragRef.current.startScrollLeft + (dx / scrollableTrack) * scrollableContent;
    };

    const onMouseUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  const { submitMessage } = useSubmitMessage();
  const sendConversationStarter = useCallback(
    (text: string) => submitMessage({ text }),
    [submitMessage],
  );

  if (!conversation_starters.length) {
    return (
      <div className="mt-8 px-4">
        <div ref={scrollRef} className="no-scrollbar flex flex-nowrap gap-2 overflow-x-auto pb-1">
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
        <div ref={trackRef} className="relative mt-1.5 h-1.5 rounded-full bg-surface-tertiary">
          <div
            onMouseDown={handleThumbMouseDown}
            className="absolute top-0 h-full cursor-grab rounded-full bg-border-heavy active:cursor-grabbing"
            style={{ ...thumbStyle, transition: dragRef.current ? 'none' : 'left 0.1s, width 0.1s' }}
          />
        </div>
      </div>
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
