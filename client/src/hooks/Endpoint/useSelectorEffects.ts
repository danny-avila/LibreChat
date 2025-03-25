import React, { useMemo, useEffect, useRef } from 'react';
import { isAgentsEndpoint, isAssistantsEndpoint, LocalStorageKeys } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import type { SelectedValues } from '~/common';
import useSetIndexOptions from '~/hooks/Conversations/useSetIndexOptions';

export default function useSelectorEffects({
  index = 0,
  agentsMap,
  conversation,
  assistantsMap,
  setSelectedValues,
}: {
  index?: number;
  agentsMap: t.TAgentsMap | undefined;
  assistantsMap: t.TAssistantsMap | undefined;
  conversation: t.TConversation | null;
  setSelectedValues: React.Dispatch<React.SetStateAction<SelectedValues>>;
}) {
  const { setOption } = useSetIndexOptions();
  const agents: t.Agent[] = useMemo(() => {
    return Object.values(agentsMap ?? {}) as t.Agent[];
  }, [agentsMap]);
  const { agent_id: selectedAgentId = null, endpoint } = conversation ?? {};

  useEffect(() => {
    if (selectedAgentId == null && agents.length > 0) {
      let agent_id = localStorage.getItem(`${LocalStorageKeys.AGENT_ID_PREFIX}${index}`);
      if (agent_id == null) {
        agent_id = agents[0].id;
      }
      const agent = agentsMap?.[agent_id];

      if (agent !== undefined && isAgentsEndpoint(endpoint as string) === true) {
        setOption('model')('');
        setOption('agent_id')(agent_id);
      }
    }
  }, [index, agents, selectedAgentId, agentsMap, endpoint, setOption]);

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedSetSelectedValues = (values: SelectedValues) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      setSelectedValues(values);
    }, 150);
  };

  useEffect(() => {
    if (!conversation?.endpoint) {
      return;
    }
    if (
      conversation?.assistant_id ||
      conversation?.agent_id ||
      conversation?.model ||
      conversation?.spec
    ) {
      if (isAgentsEndpoint(conversation?.endpoint)) {
        debouncedSetSelectedValues({
          endpoint: conversation.endpoint || '',
          model: conversation.agent_id ?? '',
          modelSpec: '',
        });
        return;
      } else if (isAssistantsEndpoint(conversation?.endpoint)) {
        debouncedSetSelectedValues({
          endpoint: conversation.endpoint || '',
          model: conversation.assistant_id || '',
          modelSpec: conversation.spec || '',
        });
        return;
      }
      debouncedSetSelectedValues({
        endpoint: conversation.endpoint || '',
        model: conversation.model || '',
        modelSpec: conversation.spec || '',
      });
    }
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [
    conversation?.spec,
    conversation?.model,
    conversation?.endpoint,
    conversation?.agent_id,
    conversation?.assistant_id,
  ]);
}
