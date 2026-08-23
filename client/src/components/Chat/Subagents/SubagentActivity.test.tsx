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

jest.mock('~/components/Chat/Messages/Content/Parts', () => ({
  EmptyText: () => <div data-testid="thinking-cursor" />,
}));

jest.mock('~/components/Chat/Messages/Content/ContentParts', () => ({
  __esModule: true,
  default: function MockContentParts({
    content,
    messageId,
  }: {
    content: Array<{
      type: string;
      text?: string;
      phase?: string;
      think?: string;
      reasoning_label?: string;
      activity_label?: string;
      tool_call?: {
        id: string;
        name: string;
        args?: unknown;
        output?: string;
        inputValidationError?: true;
        approval?: unknown;
        runStepStatus?: string;
      };
    }>;
    messageId: string;
  }) {
    const { useState } = jest.requireActual<typeof import('react')>('react');
    const [expandedTool, setExpandedTool] = useState<string | null>(null);
    const tools = content.filter((part) => part.type === 'tool_call');
    return (
      <div data-testid="regular-content-parts" data-message-id={messageId}>
        {content.map((part, index) => {
          if (part.type === 'text') {
            return (
              <div key={index} data-phase={part.phase}>
                {part.text}
              </div>
            );
          }
          if (part.type === 'think') {
            return <div key={index}>{part.reasoning_label ?? part.think}</div>;
          }
          if (part.type === 'activity_label') {
            return <div key={index}>{part.activity_label}</div>;
          }
          if (part.type !== 'tool_call' || part.tool_call == null) return null;
          const tool = part.tool_call;
          return (
            <div key={tool.id}>
              <button
                type="button"
                aria-expanded={expandedTool === tool.id}
                data-run-step-status={tool.runStepStatus}
                data-input-validation-error={tool.inputValidationError}
                onClick={() => setExpandedTool(expandedTool === tool.id ? null : tool.id)}
              >
                {tool.name}
              </button>
              {expandedTool === tool.id && (
                <div>
                  {JSON.stringify(tool.args)} {tool.output}
                </div>
              )}
              {tool.approval != null && <div data-testid="tool-approval" />}
            </div>
          );
        })}
        {/* eslint-disable-next-line i18next/no-literal-string */}
        {tools.length > 1 && <div>Used {tools.length} tools</div>}
      </div>
    );
  },
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

  it('preserves question input-validation failure for the regular renderer', () => {
    render(
      <SubagentActivity
        activity={{
          ...base,
          items: [
            {
              type: 'tool',
              toolCallId: 'question',
              name: 'ask_user_question',
              output: 'Invalid question schema',
              status: 'completed',
              inputValidationError: true,
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'ask_user_question' })).toHaveAttribute(
      'data-input-validation-error',
      'true',
    );
  });

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

  it('marks bounded activity as shortened without expanding tool details', () => {
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
    expect(screen.getByText('com_ui_subagent_thread_history_truncated')).toBeInTheDocument();
  });

  it('renders writing, reasoning, grouped tools, and collapsed details', () => {
    render(<SubagentActivity activity={base} />);

    expect(screen.queryByText('com_ui_subagent_ticker_writing')).not.toBeInTheDocument();
    expect(screen.getByText('Final answer.')).toBeInTheDocument();
    expect(screen.getByText('Visible reasoning.')).toBeInTheDocument();
    expect(screen.getByText('Used 2 tools')).toBeInTheDocument();
    expect(screen.queryByText(/Found it/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'search' }));
    expect(screen.getByText(/Found it/)).toBeInTheDocument();
  });

  it('routes parent phase and reasoning labels through regular ContentParts', () => {
    render(
      <SubagentActivity
        activity={{
          ...base,
          items: [
            { type: 'reasoning', text: 'Reasoned.', label: 'Checked constraints' },
            { type: 'writing', text: 'Draft.', phase: 'commentary' },
            {
              type: 'activity_label',
              label: 'Prepared the release',
              labelType: 'phase',
              activityStartIndex: 0,
              activityEndIndex: 2,
            },
          ],
        }}
      />,
    );

    expect(screen.getByTestId('regular-content-parts')).toBeInTheDocument();
    expect(screen.getByText('Checked constraints')).toBeInTheDocument();
    expect(screen.getByText('Draft.')).toHaveAttribute('data-phase', 'commentary');
    expect(screen.getByText('Prepared the release')).toBeInTheDocument();
  });

  it('scopes regular-chat renderer state to the selected child activity', () => {
    render(<SubagentActivity activity={base} activityId="parent:tool:child" />);

    expect(screen.getByTestId('regular-content-parts')).toHaveAttribute(
      'data-message-id',
      'parent:tool:child',
    );
  });

  it('renders a sanitized reasoning marker through regular ContentParts', () => {
    render(
      <SubagentActivity
        activity={{ ...base, status: 'running', items: [{ type: 'reasoning' }] }}
      />,
    );

    expect(screen.getByTestId('regular-content-parts')).toBeInTheDocument();
    expect(screen.getByText('com_ui_subagent_ticker_reasoning')).toBeInTheDocument();
  });

  it('uses the regular thinking cursor without running-state prose', () => {
    render(<SubagentActivity activity={{ ...base, status: 'running', items: [] }} />);

    expect(screen.getByTestId('thinking-cursor')).toBeInTheDocument();
    expect(screen.queryByText('com_ui_subagent_no_result_yet')).not.toBeInTheDocument();
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

  it('renders loading as the regular thinking cursor without prose', () => {
    render(
      <SubagentActivity activity={{ ...base, status: 'running', items: [] }} state="loading" />,
    );
    expect(screen.getByTestId('thinking-cursor')).toBeInTheDocument();
    expect(screen.queryByText('com_ui_subagent_waiting')).not.toBeInTheDocument();
  });

  it.each([
    ['error', 'com_ui_subagent_thread_load_error'],
    ['ready', 'com_ui_subagent_empty_result'],
  ] as const)('renders the %s state', (state, label) => {
    render(<SubagentActivity activity={{ ...base, items: [] }} state={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
