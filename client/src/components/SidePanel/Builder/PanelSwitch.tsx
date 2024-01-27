import { useState } from 'react';
import AssistantPanel from './AssistantPanel';
import ActionsPanel from './ActionsPanel';
import { Panel } from '~/common';

export default function PanelSwitch() {
  const [activePanel, setActivePanel] = useState(Panel.builder);

  if (activePanel === Panel.builder) {
    return <AssistantPanel activePanel={activePanel} setActivePanel={setActivePanel} />;
  } else if (activePanel === Panel.actions) {
    return <ActionsPanel activePanel={activePanel} setActivePanel={setActivePanel} />;
  }
}
