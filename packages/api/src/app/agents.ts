import type { TAgentsEndpoint } from 'librechat-data-provider';

type AgentEventRuntimeConfig = NonNullable<TAgentsEndpoint['eventDriven']>;

const setBooleanEnvironmentFallback = (name: string, value?: boolean): void => {
  if (value != null) {
    process.env[name] = String(value);
  }
};

/** Applies base-config rollout flags before the HTTP listener accepts agent events. */
export const configureAgentEventRuntime = (config?: AgentEventRuntimeConfig): void => {
  setBooleanEnvironmentFallback('ENABLE_AGENT_EVENT_CHILD_TURNS', config?.childTurns);
  setBooleanEnvironmentFallback('ENABLE_SUBAGENT_COMPLETION_WAKEUPS', config?.completionWakeups);
  if (config?.selfUrl != null) {
    process.env.AGENT_TRIGGERS_SELF_URL = config.selfUrl;
  }
};
