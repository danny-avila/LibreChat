import { useState, useEffect, useMemo } from 'react';
import { defaultAssistantsVersion } from 'librechat-data-provider';
import type { Action, TEndpointsConfig, AssistantsEndpoint } from 'librechat-data-provider';
import type { ActionsEndpoint } from '~/common';
import {
  useGetActionsQuery,
  useGetEndpointsQuery,
  useGetAssistantDocsQuery,
} from '~/data-provider';
import AssistantPanel from './AssistantPanel';
import { useChatContext } from '~/Providers';
import ActionsPanel from './ActionsPanel';
import { Panel } from '~/common';

export default function PanelSwitch() {
  const { conversation, index } = useChatContext();
  const [activePanel, setActivePanel] = useState(Panel.builder);
  const [action, setAction] = useState<Action | undefined>(undefined);
  const [currentAssistantId, setCurrentAssistantId] = useState<string | undefined>(
    conversation?.assistant_id,
  );

  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  const { data: actions = [] } = useGetActionsQuery(conversation?.endpoint as ActionsEndpoint);
  const { data: documentsMap = null } = useGetAssistantDocsQuery(conversation?.endpoint ?? '', {
    select: (data) => new Map(data.map((dbA) => [dbA.assistant_id, dbA])),
  });

  const assistantsConfig = useMemo(
    () => endpointsConfig?.[conversation?.endpoint ?? ''],
    [conversation?.endpoint, endpointsConfig],
  );

  useEffect(() => {
    const currentId = conversation?.assistant_id ?? '';
    if (currentId) {
      setCurrentAssistantId(currentId);
    }
  }, [conversation?.assistant_id]);

  if (!conversation?.endpoint) {
    return null;
  }

  const version = assistantsConfig?.version ?? defaultAssistantsVersion[conversation.endpoint];

  if (activePanel === Panel.actions || action) {
    return (
      <ActionsPanel
        index={index}
        action={action}
        actions={actions}
        setAction={setAction}
        activePanel={activePanel}
        documentsMap={documentsMap}
        setActivePanel={setActivePanel}
        assistant_id={currentAssistantId}
        setCurrentAssistantId={setCurrentAssistantId}
        endpoint={conversation.endpoint as AssistantsEndpoint}
        version={version}
      />
    );
  } else if (activePanel === Panel.builder) {
    return (
      <AssistantPanel
        index={index}
        activePanel={activePanel}
        action={action}
        actions={actions}
        setAction={setAction}
        documentsMap={documentsMap}
        setActivePanel={setActivePanel}
        assistant_id={currentAssistantId}
        setCurrentAssistantId={setCurrentAssistantId}
        endpoint={conversation.endpoint as AssistantsEndpoint}
        assistantsConfig={assistantsConfig}
        version={version}
      />
    );
  }
}
