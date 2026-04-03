import React from 'react';
import { render } from '@testing-library/react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { Agent } from 'librechat-data-provider';
import type { TMessageIcon } from '~/common';

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  getEndpointField: jest.fn(() => ''),
}));
jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: jest.fn(() => ({ data: {} })),
}));

// logger is a plain object with a real function — not a jest.fn() —
// so restoreMocks/clearMocks won't touch it. We spy on it per-test instead.
const logCalls: unknown[][] = [];
jest.mock('~/utils', () => ({
  getIconEndpoint: jest.fn(() => 'agents'),
  logger: {
    log: (...args: unknown[]) => {
      logCalls.push(args);
    },
  },
}));
jest.mock('~/components/Endpoints/ConvoIconURL', () => {
  const ConvoIconURL = (props: Record<string, unknown>) => (
    <div data-testid="convo-icon-url" data-icon-url={props.iconURL as string} />
  );
  ConvoIconURL.displayName = 'ConvoIconURL';
  return { __esModule: true, default: ConvoIconURL };
});
jest.mock('~/components/Endpoints/Icon', () => {
  const Icon = (props: Record<string, unknown>) => (
    <div data-testid="icon" data-icon-url={props.iconURL as string} />
  );
  Icon.displayName = 'Icon';
  return { __esModule: true, default: Icon };
});

import MessageIcon from '../MessageIcon';

const makeAgent = (overrides?: Partial<Agent>): Agent =>
  ({
    id: 'agent_123',
    name: 'GitHub Agent',
    avatar: { filepath: '/images/agent-avatar.png' },
    ...overrides,
  }) as Agent;

const baseIconData: TMessageIcon = {
  endpoint: EModelEndpoint.agents,
  model: 'agent_123',
  iconURL: undefined,
  modelLabel: 'GitHub Agent',
  isCreatedByUser: false,
};

describe('MessageIcon render cycles', () => {
  beforeEach(() => {
    logCalls.length = 0;
  });

  it('renders once on initial mount', () => {
    render(<MessageIcon iconData={baseIconData} agent={makeAgent()} />);
    const iconDataCalls = logCalls.filter((c) => c[0] === 'icon_data');
    expect(iconDataCalls).toHaveLength(1);
  });

  it('does not re-render when parent re-renders with same field values but new object references', () => {
    const agent = makeAgent();
    const { rerender } = render(<MessageIcon iconData={baseIconData} agent={agent} />);
    logCalls.length = 0;

    // Simulate parent re-render: new iconData object (same field values), new agent object (same data)
    rerender(<MessageIcon iconData={{ ...baseIconData }} agent={makeAgent()} />);

    const iconDataCalls = logCalls.filter((c) => c[0] === 'icon_data');
    expect(iconDataCalls).toHaveLength(0);
  });

  it('does not re-render when agent object reference changes but name and avatar are the same', () => {
    const agent1 = makeAgent();
    const { rerender } = render(<MessageIcon iconData={baseIconData} agent={agent1} />);
    logCalls.length = 0;

    // New agent object with different id but same display fields
    const agent2 = makeAgent({ id: 'agent_456' });
    rerender(<MessageIcon iconData={baseIconData} agent={agent2} />);

    const iconDataCalls = logCalls.filter((c) => c[0] === 'icon_data');
    expect(iconDataCalls).toHaveLength(0);
  });

  it('re-renders when agent avatar filepath changes', () => {
    const agent1 = makeAgent();
    const { rerender } = render(<MessageIcon iconData={baseIconData} agent={agent1} />);
    logCalls.length = 0;

    const agent2 = makeAgent({ avatar: { filepath: '/images/new-avatar.png' } });
    rerender(<MessageIcon iconData={baseIconData} agent={agent2} />);

    const iconDataCalls = logCalls.filter((c) => c[0] === 'icon_data');
    expect(iconDataCalls).toHaveLength(1);
  });

  it('re-renders when agent goes from undefined to defined (name changes from undefined to string)', () => {
    const { rerender } = render(<MessageIcon iconData={baseIconData} agent={undefined} />);
    logCalls.length = 0;

    rerender(<MessageIcon iconData={baseIconData} agent={makeAgent()} />);

    const iconDataCalls = logCalls.filter((c) => c[0] === 'icon_data');
    expect(iconDataCalls).toHaveLength(1);
  });

  describe('simulates message lifecycle', () => {
    it('renders exactly twice during new message + streaming start: initial render + modelLabel update', () => {
      // Phase 1: Initial response message created by useChatFunctions
      // model is set to agent_id, iconURL is undefined, modelLabel is '' or sender
      const initialIconData: TMessageIcon = {
        endpoint: EModelEndpoint.agents,
        model: 'agent_123',
        iconURL: undefined,
        modelLabel: '', // Not yet resolved
        isCreatedByUser: false,
      };
      const agent = makeAgent();

      const { rerender } = render(<MessageIcon iconData={initialIconData} agent={agent} />);

      // Phase 2: First streaming chunk arrives, messageLabel resolves to agent name
      // This is a legitimate re-render — modelLabel changed from '' to 'GitHub Agent'
      const streamingIconData: TMessageIcon = {
        ...initialIconData,
        modelLabel: 'GitHub Agent',
      };

      rerender(<MessageIcon iconData={streamingIconData} agent={agent} />);

      const iconDataCalls = logCalls.filter((c) => c[0] === 'icon_data');
      // Exactly 2: initial mount + modelLabel change
      expect(iconDataCalls).toHaveLength(2);
    });

    it('does NOT re-render on subsequent streaming chunks (content changes, isSubmitting stays true)', () => {
      const iconData: TMessageIcon = {
        endpoint: EModelEndpoint.agents,
        model: 'agent_123',
        iconURL: undefined,
        modelLabel: 'GitHub Agent',
        isCreatedByUser: false,
      };
      const agent = makeAgent();

      const { rerender } = render(<MessageIcon iconData={iconData} agent={agent} />);
      logCalls.length = 0;

      // Simulate multiple parent re-renders from streaming chunks
      // Parent (ContentRender) re-renders because chatContext changed,
      // but MessageIcon props are identical field-by-field
      for (let i = 0; i < 5; i++) {
        rerender(<MessageIcon iconData={{ ...iconData }} agent={makeAgent()} />);
      }

      const iconDataCalls = logCalls.filter((c) => c[0] === 'icon_data');
      expect(iconDataCalls).toHaveLength(0);
    });

    it('does NOT re-render when agentsMap context updates with same agent data', () => {
      const iconData: TMessageIcon = {
        endpoint: EModelEndpoint.agents,
        model: 'agent_123',
        iconURL: undefined,
        modelLabel: 'GitHub Agent',
        isCreatedByUser: false,
      };

      // First render with agent from original agentsMap
      const agent1 = makeAgent();
      const { rerender } = render(<MessageIcon iconData={iconData} agent={agent1} />);
      logCalls.length = 0;

      // agentsMap refetched → new agent object, same display data
      const agent2 = makeAgent();
      expect(agent1).not.toBe(agent2); // different reference
      rerender(<MessageIcon iconData={iconData} agent={agent2} />);

      const iconDataCalls = logCalls.filter((c) => c[0] === 'icon_data');
      expect(iconDataCalls).toHaveLength(0);
    });
  });
});
