import { useState, useEffect } from 'react';
import type { Action } from 'librechat-data-provider';
import { useGetActionsQuery } from '~/data-provider';
import AssistantPanel from './AssistantPanel';
import { useChatContext } from '~/Providers';
import ActionsPanel from './ActionsPanel';
import { Panel } from '~/common';

export default function PanelSwitch() {
  const { conversation, index } = useChatContext();
  const [activePanel, setActivePanel] = useState(Panel.builder);
  const [currentAssistantId, setCurrentAssistantId] = useState<string | undefined>(
    conversation?.assistant_id,
  );
  const [action, setAction] = useState<Action | undefined>(undefined);
  const { data: actions = [] } = useGetActionsQuery();

  useEffect(() => {
    if (conversation?.assistant_id) {
      setCurrentAssistantId(conversation?.assistant_id);
    }
  }, [conversation?.assistant_id]);

  if (activePanel === Panel.actions || action) {
    return (
      <ActionsPanel
        index={index}
        action={action}
        actions={actions}
        setAction={setAction}
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        assistant_id={currentAssistantId}
        setCurrentAssistantId={setCurrentAssistantId}
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
        setActivePanel={setActivePanel}
        assistant_id={currentAssistantId}
        setCurrentAssistantId={setCurrentAssistantId}
      />
    );
  }
}
