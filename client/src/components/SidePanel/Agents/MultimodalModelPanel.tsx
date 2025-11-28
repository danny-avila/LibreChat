import React from 'react';
import type { AgentModelPanelProps } from '~/common';
import AlternativeModelPanel from './AlternativeModelPanel';

/**
 * Panel for configuring a multimodal model that is used when images, videos,
 * or audio are present in the conversation.
 */
export default function MultimodalModelPanel(
  props: Pick<AgentModelPanelProps, 'models' | 'providers' | 'setActivePanel'>,
) {
  return <AlternativeModelPanel type="multimodal" {...props} />;
}
