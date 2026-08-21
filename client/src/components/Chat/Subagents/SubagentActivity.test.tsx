import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Agents } from 'librechat-data-provider';
import type { ChildActivity } from './adapters';
import SubagentActivity from './SubagentActivity';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/components/Chat/Messages/Content/Parts/Text', () => ({
  __esModule: true,
  default: ({ text }: { text: string }) => <div>{text}</div>,
}));

jest.mock('~/components/Chat/Messages/Content/Parts/Reasoning', () => ({
  __esModule: true,
  default: ({ reasoning }: { reasoning: string }) => <div>{reasoning}</div>,
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

jest.mock('~/components/Chat/Messages/Content/Container', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('~/components/Chat/Messages/Content/ToolCall', () => ({
  __esModule: true,
  default: function MockToolCall({
    name,
    args,
    output,
    runStepStatus,
  }: {
    name: string;
    args: unknown;
    output: string;
    runStepStatus?: string;
  }) {
    const { useState } = jest.requireActual<typeof import('react')>('react');
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button
          type="button"
          aria-expanded={open}
          data-run-step-status={runStepStatus}
          onClick={() => setOpen((value) => !value)}
        >
          {name}
        </button>
        {open && (
          <div>
            {JSON.stringify(args)} {output}
          </div>
        )}
      </div>
    );
  },
}));

jest.mock('~/components/Chat/Messages/Content/ToolCallGroup', () => ({
  __esModule: true,
  default: ({
    parts,
    renderPart,
    lastContentIdx,
  }: {
    parts: Array<{ part: unknown; idx: number }>;
    renderPart: (part: unknown, idx: number, isLast: boolean) => React.ReactNode;
    lastContentIdx: number;
  }) => (
    <div>
      {/* eslint-disable-next-line i18next/no-literal-string */}
      <div>Used {parts.length} tools</div>
      {parts.map(({ part, idx }) => renderPart(part, idx, idx === lastContentIdx))}
    </div>
  ),
}));

jest.mock('~/components/Chat/Messages/Content/ToolApproval', () => ({
  __esModule: true,
  // eslint-disable-next-line i18next/no-literal-string
  default: () => <div data-testid="tool-approval">approval</div>,
}));

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock('lucide-react', () => ({
  AlertCircle: () => null,
  ArrowDown: () => null,
  CheckCircle2: () => null,
  Clock3: () => null,
  Maximize2: () => null,
  Minimize2: () => null,
  XCircle: () => null,
}));

const base: ChildActivity = {
  title: 'Research child',
  prompt: 'Investigate.',
  status: 'completed',
  items: [
    { type: 'reasoning', text: 'Visible reasoning.' },
    {
      type: 'tool',
      toolCallId: 'tool-1',
      name: 'search',
      input: '{"query":"release"}',
      output: 'Found it.',
      status: 'completed',
    },
    {
      type: 'tool',
      toolCallId: 'tool-2',
      name: 'calculator',
      input: '{"value":4}',
      output: '4',
      status: 'completed',
    },
    { type: 'writing', text: 'Final answer.' },
  ],
};

describe('SubagentActivity', () => {
  it.each(['running', 'completed', 'failed', 'cancelled'] as const)(
    'renders the %s lifecycle through the shared view',
    (status) => {
      render(<SubagentActivity activity={{ ...base, status }} />);
      expect(screen.getByText(`com_ui_subagent_thread_status_${status}`)).toBeInTheDocument();
    },
  );

  it('renders approval controls when the provider persists an empty output', () => {
    render(
      <SubagentActivity
        activity={{
          ...base,
          status: 'running',
          items: [
            {
              type: 'tool',
              toolCallId: 'tool',
              name: 'protected_tool',
              output: '',
              status: 'running',
              approval: {} as Agents.ToolCall['approval'],
            },
          ],
        }}
      />,
    );

    expect(screen.getByTestId('tool-approval')).toBeInTheDocument();
  });

  it('marks bounded tool details as shortened without expanding them', () => {
    render(
      <SubagentActivity
        activity={{
          ...base,
          items: [
            {
              type: 'tool',
              toolCallId: 'tool',
              name: 'search',
              input: 'bounded input',
              status: 'completed',
              inputTruncated: true,
            },
          ],
        }}
      />,
    );

    expect(screen.queryByText('bounded input')).not.toBeInTheDocument();
    expect(screen.getByText('com_ui_subagent_thread_message_truncated')).toBeInTheDocument();
  });

  it('renders writing, reasoning, grouped tools, and collapsed details', () => {
    render(<SubagentActivity activity={base} />);

    expect(screen.getByText('com_ui_subagent_ticker_writing')).toBeInTheDocument();
    expect(screen.getByText('Visible reasoning.')).toBeInTheDocument();
    expect(screen.getByText('Used 2 tools')).toBeInTheDocument();
    expect(screen.queryByText(/Found it/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'search' }));
    expect(screen.getByText(/Found it/)).toBeInTheDocument();
  });

  it.each(['running', 'completed', 'failed', 'cancelled'] as const)(
    'renders a %s tool lifecycle through the shared view',
    (status) => {
      render(
        <SubagentActivity
          activity={{
            ...base,
            items: [{ type: 'tool', toolCallId: 'tool', name: 'search', status }],
          }}
        />,
      );

      const tool = screen.getByRole('button', { name: 'search' });
      if (status === 'running') {
        expect(tool).not.toHaveAttribute('data-run-step-status');
      } else {
        expect(tool).toHaveAttribute('data-run-step-status', status);
      }
    },
  );

  it.each([
    ['loading', 'com_ui_subagent_waiting'],
    ['error', 'com_ui_subagent_thread_load_error'],
    ['ready', 'com_ui_subagent_empty_result'],
  ] as const)('renders the %s state', (state, label) => {
    render(<SubagentActivity activity={{ ...base, items: [] }} state={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
