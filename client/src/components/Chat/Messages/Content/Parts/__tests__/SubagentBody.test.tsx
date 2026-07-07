import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TMessageContentParts } from 'librechat-data-provider';
import { SubagentBody, SubagentPrompt } from '../SubagentBody';

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string): string => {
      const translations: Record<string, string> = {
        com_ui_subagent_no_result_yet: 'No result yet.',
        com_ui_subagent_empty_result: 'No text returned.',
        com_ui_prompt: 'Prompt',
      };
      return translations[key] ?? key;
    },
  useExpandCollapse: () => ({ style: {}, ref: { current: null } }),
}));

jest.mock('../Text', () => ({
  __esModule: true,
  default: ({ text }: { text: string }) => <div data-testid="text-part">{text}</div>,
}));

jest.mock('../Reasoning', () => ({
  __esModule: true,
  default: ({ reasoning }: { reasoning: string }) => (
    <div data-testid="reasoning-part">{reasoning}</div>
  ),
}));

jest.mock('~/components/Chat/Messages/Content/ToolCall', () => ({
  __esModule: true,
  default: ({ name, output }: { name: string; output: string }) => (
    <div data-testid="tool-call-part" data-name={name}>
      {output}
    </div>
  ),
}));

// ToolApproval pulls in the ariakit-backed approval UI; stub it so the suite
// doesn't load that chain in jsdom.
jest.mock('~/components/Chat/Messages/Content/ToolApproval', () => ({
  __esModule: true,
  default: ({ toolCallId }: { toolCallId: string }) => (
    <div data-testid="tool-approval" data-toolcallid={toolCallId} />
  ),
}));

jest.mock('~/components/Chat/Messages/Content/Container', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="container">{children}</div>
  ),
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
    <div data-testid="tool-call-group">
      {parts.map(({ part, idx }) => renderPart(part, idx, idx === lastContentIdx))}
    </div>
  ),
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="prompt-markdown">{content}</div>,
}));

jest.mock('lucide-react', () => ({
  // eslint-disable-next-line i18next/no-literal-string
  ChevronDown: () => <span>chevron-down</span>,
  Quote: () => <span />,
}));

jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils/groupToolCalls'),
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

describe('SubagentBody', () => {
  it('renders reasoning, tool_call, and text parts through the leaf renderers', () => {
    const contentParts = [
      { type: 'think', think: 'Let me compute.' },
      { type: 'tool_call', tool_call: { id: 'c1', name: 'calculator', output: '4', progress: 1 } },
      { type: 'text', text: 'The answer is 4.' },
    ] as unknown as TMessageContentParts[];

    render(<SubagentBody toolCallId="call_body" running={false} contentParts={contentParts} />);

    expect(screen.getByTestId('reasoning-part')).toHaveTextContent('Let me compute.');
    expect(screen.getByTestId('tool-call-part')).toHaveAttribute('data-name', 'calculator');
    expect(screen.getByTestId('tool-call-part')).toHaveTextContent('4');
    expect(screen.getByTestId('text-part')).toHaveTextContent('The answer is 4.');
  });

  it('surfaces approval controls for a tool paused inside the subagent (no output yet)', () => {
    const contentParts = [
      {
        type: 'tool_call',
        tool_call: {
          id: 'tc-approve',
          name: 'run_shell',
          args: '{}',
          approval: { state: 'pending' },
        },
      },
    ] as unknown as TMessageContentParts[];

    render(<SubagentBody toolCallId="call_approval" running={true} contentParts={contentParts} />);

    expect(screen.getByTestId('tool-call-part')).toHaveAttribute('data-name', 'run_shell');
    expect(screen.getByTestId('tool-approval')).toHaveAttribute('data-toolcallid', 'tc-approve');
  });

  it('falls back to the raw output when there are no content parts', () => {
    render(
      <SubagentBody
        toolCallId="call_fallback"
        running={false}
        contentParts={[]}
        output="raw final text"
      />,
    );
    expect(screen.getByTestId('text-part')).toHaveTextContent('raw final text');
  });

  it('shows the empty-result message when there is neither content nor output', () => {
    render(<SubagentBody toolCallId="call_empty" running={false} contentParts={[]} />);
    expect(screen.getByText('No text returned.')).toBeInTheDocument();
  });

  it('shows the still-running message while streaming with no content yet', () => {
    render(<SubagentBody toolCallId="call_run" running={true} contentParts={[]} />);
    expect(screen.getByText('No result yet.')).toBeInTheDocument();
  });
});

describe('SubagentPrompt (panel disclosure)', () => {
  it('is collapsed by default, shows a symbol-stripped preview, and toggles open', () => {
    render(<SubagentPrompt prompt="# Review prompt" />);

    const toggle = screen.getByRole('button', { name: /Prompt/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Collapsed row still teases the task (markdown symbols stripped).
    expect(toggle).toHaveTextContent('Review prompt');
    // Content is always mounted (height is animated via a grid transition).
    expect(screen.getByTestId('prompt-markdown')).toHaveTextContent('# Review prompt');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});
