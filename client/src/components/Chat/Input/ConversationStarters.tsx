/* eslint-disable i18next/no-literal-string */
import { useMemo, useCallback } from 'react';
import { EModelEndpoint, Constants } from 'librechat-data-provider';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import { useGetAssistantDocsQuery, useGetEndpointsQuery, useGetUserQuery } from '~/data-provider';
import { useJurisdictionsQuery } from '~/data-provider/CodeCan';
import { getIconEndpoint, getEntity } from '~/utils';
import { useSubmitMessage } from '~/hooks';

const CODECAN_FALLBACK_STARTERS = [
  'What is the minimum stair width in a single dwelling?',
  'Do my smoke alarms need to be interconnected?',
  'Maximum joist spacing for a 2x10 deck?',
];

const ConversationStarters = () => {
  const { conversation } = useChatContext();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: user } = useGetUserQuery();
  const { data: catalog } = useJurisdictionsQuery();

  const endpointType = useMemo(() => {
    let ep = conversation?.endpoint ?? '';
    if (
      [
        EModelEndpoint.chatGPTBrowser,
        EModelEndpoint.azureOpenAI,
        EModelEndpoint.gptPlugins,
      ].includes(ep as EModelEndpoint)
    ) {
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

  const { entity } = getEntity({
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

    const fromDocs = documentsMap.get(entity?.id ?? '')?.conversation_starters;
    if (fromDocs?.length) {
      return fromDocs;
    }

    // Prefer the conversation's locked jurisdiction; fall back to the user's account default;
    // finally the registry default. If the catalog hasn't loaded, use the hardcoded fallback.
    const jurisdictionId =
      (conversation as { jurisdiction?: string } | null)?.jurisdiction ??
      user?.personalization?.jurisdiction ??
      catalog?.selected ??
      catalog?.default;
    const fromCatalog = catalog?.jurisdictions?.find((j) => j.id === jurisdictionId)?.starters;
    if (fromCatalog?.length) {
      return fromCatalog;
    }
    return CODECAN_FALLBACK_STARTERS;
  }, [documentsMap, entity, conversation, user, catalog]);

  const { submitMessage } = useSubmitMessage();
  const sendConversationStarter = useCallback(
    (text: string) => submitMessage({ text }),
    [submitMessage],
  );

  if (!conversation_starters.length) {
    return null;
  }

  const starters = conversation_starters.slice(0, Constants.MAX_CONVO_STARTERS);

  return (
    <div className="mx-auto mt-8 flex w-full max-w-md flex-col gap-2 px-4">
      <div className="flex items-center gap-2 px-1 pb-1">
        <span className="h-px flex-1 bg-[rgba(11,47,91,0.08)] dark:bg-white/[0.08]" />
        {}
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-cc-slate-400 dark:text-dm-text-faint">
          Try asking
        </span>
        <span className="h-px flex-1 bg-[rgba(11,47,91,0.08)] dark:bg-white/[0.08]" />
      </div>
      {starters.map((text: string, index: number) => (
        <button
          key={index}
          onClick={() => sendConversationStarter(text)}
          className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[rgba(11,47,91,0.08)] bg-white px-3.5 py-2.5 text-left transition-colors duration-200 fade-in hover:bg-paper-100 dark:border-white/[0.08] dark:bg-dm-surface dark:hover:bg-dm-surface2"
        >
          <span className="min-h-[18px] w-[3px] flex-none self-stretch rounded-[2px] bg-signal-amber" />
          <span className="line-clamp-2 flex-1 text-[14px] italic text-ink-800 dark:text-dm-text">
            {text}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="text-ink-800 dark:text-signal-amber"
          >
            <path
              d="M9 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ))}
    </div>
  );
};

export default ConversationStarters;
