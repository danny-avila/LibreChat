import { configureAgentEventRuntime } from './agents';

describe('configureAgentEventRuntime', () => {
  const originalEnvironment = process.env;

  beforeEach(() => {
    process.env = { ...originalEnvironment };
    delete process.env.ENABLE_AGENT_EVENT_CHILD_TURNS;
    delete process.env.ENABLE_SUBAGENT_COMPLETION_WAKEUPS;
    delete process.env.ENABLE_AGENT_EVENT_COALESCING;
    delete process.env.ENABLE_AGENT_EVENT_ACTOR_MAILBOX;
    delete process.env.ENABLE_AGENT_EVENT_DURABLE_RECEIPTS;
    delete process.env.AGENT_TRIGGERS_SELF_URL;
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('projects explicit base-config rollout flags into the legacy runtime seam', () => {
    configureAgentEventRuntime({
      childTurns: true,
      completionWakeups: false,
      coalescing: true,
      actorMailbox: true,
      durableReceipts: true,
      selfUrl: 'https://triggers.internal',
    });

    expect(process.env.ENABLE_AGENT_EVENT_CHILD_TURNS).toBe('true');
    expect(process.env.ENABLE_SUBAGENT_COMPLETION_WAKEUPS).toBe('false');
    expect(process.env.ENABLE_AGENT_EVENT_COALESCING).toBe('true');
    expect(process.env.ENABLE_AGENT_EVENT_ACTOR_MAILBOX).toBe('true');
    expect(process.env.ENABLE_AGENT_EVENT_DURABLE_RECEIPTS).toBe('true');
    expect(process.env.AGENT_TRIGGERS_SELF_URL).toBe('https://triggers.internal');
  });

  it('preserves environment fallbacks when the YAML fields are omitted', () => {
    process.env.ENABLE_AGENT_EVENT_CHILD_TURNS = 'true';
    process.env.ENABLE_SUBAGENT_COMPLETION_WAKEUPS = 'true';
    process.env.ENABLE_AGENT_EVENT_COALESCING = 'true';
    process.env.ENABLE_AGENT_EVENT_ACTOR_MAILBOX = 'true';
    process.env.ENABLE_AGENT_EVENT_DURABLE_RECEIPTS = 'true';
    process.env.AGENT_TRIGGERS_SELF_URL = 'https://legacy.internal';

    configureAgentEventRuntime(undefined);

    expect(process.env.ENABLE_AGENT_EVENT_CHILD_TURNS).toBe('true');
    expect(process.env.ENABLE_SUBAGENT_COMPLETION_WAKEUPS).toBe('true');
    expect(process.env.ENABLE_AGENT_EVENT_COALESCING).toBe('true');
    expect(process.env.ENABLE_AGENT_EVENT_ACTOR_MAILBOX).toBe('true');
    expect(process.env.ENABLE_AGENT_EVENT_DURABLE_RECEIPTS).toBe('true');
    expect(process.env.AGENT_TRIGGERS_SELF_URL).toBe('https://legacy.internal');
  });
});
