/**
 * @jest-environment jsdom
 */
import { render } from '@testing-library/react';
import type { ControllerRenderProps } from 'react-hook-form';
import type { ReactNode } from 'react';
import type { AgentForm } from '~/common';
import AgentSubagents from '../AgentSubagents';

let selectAgent: ((agentId: string) => void) | undefined;

jest.mock('@librechat/client', () => ({
  Switch: () => null,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('../AgentList', () => ({
  AddAgentSelect: ({ onSelect }: { onSelect: (agentId: string) => void }) => {
    selectAgent = onSelect;
    return null;
  },
  ListMeta: () => null,
  StaticAgentRow: () => null,
  useSelectableAgents: () => ({ options: [], getAgent: () => undefined }),
}));

jest.mock('../OrchestrationPattern', () => ({
  __esModule: true,
  default: ({ children, trailing }: { children: ReactNode; trailing: ReactNode }) => (
    <>
      {trailing}
      {children}
    </>
  ),
}));

jest.mock('../ui', () => ({
  ToggleSetting: () => null,
}));

describe('AgentSubagents', () => {
  beforeEach(() => {
    selectAgent = undefined;
  });

  it('commits a selected agent to form state synchronously', () => {
    let persistedValue: NonNullable<AgentForm['subagents']> = {
      enabled: true,
      allowSelf: false,
      agent_ids: [] as string[],
    };
    const field = {
      name: 'subagents',
      value: persistedValue,
      onBlur: jest.fn(),
      onChange: jest.fn((value: NonNullable<AgentForm['subagents']>) => {
        persistedValue = value;
      }),
      ref: jest.fn(),
    } as unknown as ControllerRenderProps<AgentForm, 'subagents'>;

    render(<AgentSubagents field={field} currentAgentId="parent" maxSubagents={10} />);

    selectAgent?.('child');

    expect(field.onChange).toHaveBeenCalledWith({
      enabled: true,
      allowSelf: false,
      agent_ids: ['child'],
    });
    expect(persistedValue.agent_ids).toEqual(['child']);
  });
});
