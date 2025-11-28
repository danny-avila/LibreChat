import React from 'react';
import type { AgentModelPanelProps } from '~/common';
import AlternativeModelPanel from './AlternativeModelPanel';

/**
 * Panel for configuring a fallback model that is used when the primary model fails
 * (e.g., rate limits, timeouts, or other errors).
 */
export default function FallbackModelPanel(
  props: Pick<AgentModelPanelProps, 'models' | 'providers' | 'setActivePanel'>,
) {
  return <AlternativeModelPanel type="fallback" {...props} />;
}
