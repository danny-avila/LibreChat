import { useMemo, useCallback } from 'react';
import { EModelEndpoint, Constants } from 'librechat-data-provider';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext, useChatFormContext } from '~/Providers';
import { useGetAssistantDocsQuery, useGetEndpointsQuery } from '~/data-provider';
import { getIconEndpoint, getEntity } from '~/utils';
import { useSubmitMessage } from '~/hooks';

const DEFAULT_STARTERS = [
  { label: 'Help me write', prompt: 'Help me write: ' },
  { label: 'Learn about', prompt: 'Tell me about: ' },
  { label: 'Analyze Image', prompt: 'Analyze this image: ' },
  { label: 'Summarize text', prompt: 'Summarize this text: ' },
  { label: 'Analyze Data', prompt: 'Analyze this data: ' },
  { label: 'Brainstorm', prompt: 'Brainstorm ideas for: ' },
  { label: 'Improve writing', prompt: 'Improve this writing: ' },
  { label: 'Translate', prompt: 'Translate to English: ' },
  { label: 'Generate Images', prompt: 'Generate an image of: ' },
  { label: 'Generate Ideas', prompt: 'Generate creative ideas for: ' },
] as const;

const ConversationStarters = () => {
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
      <div className="mt-8 flex flex-nowrap justify-center gap-2 overflow-x-auto px-4 pb-1">
        {DEFAULT_STARTERS.map((s) => (
          <button
            key={s.label}
            onClick={() => fillInput(s.prompt)}
            className="whitespace-nowrap rounded-full border border-border-medium px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-tertiary"
          >
            {s.label}
          </button>
        ))}
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
