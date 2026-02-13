import React from 'react';
import { render, screen } from '@testing-library/react';
import { useRecoilValue } from 'recoil';
import { useMessageContext } from '~/Providers';
import Text from '../Parts/Text';

jest.mock('~/components/Chat/Messages/Content/Markdown', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="markdown-lite">{content}</div>,
}));

jest.mock('~/components/Chat/Messages/Content/ToolCall', () => ({
  __esModule: true,
  default: ({
    name,
    args,
    output,
    initialProgress,
    isSubmitting,
    isLast,
  }: {
    name: string;
    args: string;
    output?: string;
    initialProgress: number;
    isSubmitting: boolean;
    isLast?: boolean;
  }) => {
    const state = !isSubmitting && initialProgress < 1 ? 'cancelled' : 'active';

    return (
      <div
        data-testid="tool-call"
        data-name={name}
        data-args={args}
        data-output={output ?? ''}
        data-progress={String(initialProgress)}
        data-state={state}
        data-last={String(Boolean(isLast))}
      />
    );
  },
}));

jest.mock('~/Providers', () => ({
  useMessageContext: jest.fn(),
}));

jest.mock('~/utils', () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    enableUserMsgMarkdown: 'enableUserMsgMarkdown',
  },
}));

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useRecoilValue: jest.fn(),
}));

const mockUseMessageContext = useMessageContext as jest.MockedFunction<typeof useMessageContext>;
const mockUseRecoilValue = useRecoilValue as jest.MockedFunction<typeof useRecoilValue>;

describe('Text tool tag rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMessageContext.mockReturnValue({ isSubmitting: true, isLatestMessage: true } as any);
    mockUseRecoilValue.mockReturnValue(true as never);
  });

  test('renders pending tool as a ToolCall card and hides raw tool tags', () => {
    render(
      <Text text="<tool>save_file(file=a.py)</tool>" isCreatedByUser={false} showCursor={false} />,
    );

    const toolCall = screen.getByTestId('tool-call');
    expect(toolCall).toBeInTheDocument();
    expect(toolCall).toHaveAttribute('data-progress', '0.1');
    expect(screen.queryByText(/<tool>/)).not.toBeInTheDocument();
  });

  test('renders completed tool output in ToolCall', () => {
    render(
      <Text
        text={'<tool>save_file(file=a.py)\nok</tool>'}
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    const toolCall = screen.getByTestId('tool-call');
    expect(toolCall).toHaveAttribute('data-name', 'save_file');
    expect(toolCall).toHaveAttribute('data-output', 'ok');
    expect(toolCall).toHaveAttribute('data-progress', '1');
  });

  test('renders completed empty-result tool as completed state', () => {
    render(
      <Text
        text={'<tool>save_file(file=a.py)\n</tool>'}
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    const toolCall = screen.getByTestId('tool-call');
    expect(toolCall).toHaveAttribute('data-progress', '1');
    expect(toolCall).toHaveAttribute('data-output', '');
  });

  test('renders consecutive tools as separate cards', () => {
    render(
      <Text
        text="<tool>save_file(file=a.py)\nok</tool><tool>run_shell(cmd=pwd)\n/app</tool>"
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    const toolCalls = screen.getAllByTestId('tool-call');
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0]).toHaveAttribute('data-name', 'save_file');
    expect(toolCalls[1]).toHaveAttribute('data-name', 'run_shell');
  });

  test('preserves surrounding markdown for mixed text and tool content', () => {
    render(
      <Text
        text={'Before **bold**\n\n<tool>save_file(file=a.py)\nok</tool>\n\nAfter _text_'}
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    const markdownBlocks = screen.getAllByTestId('markdown');
    expect(markdownBlocks).toHaveLength(2);
    expect(markdownBlocks[0]).toHaveTextContent('Before **bold**');
    expect(markdownBlocks[1]).toHaveTextContent('After _text_');
    expect(screen.getByTestId('tool-call')).toBeInTheDocument();
  });

  test('keeps user message rendering path unchanged', () => {
    render(
      <Text text="<tool>save_file(file=a.py)</tool>" isCreatedByUser={true} showCursor={false} />,
    );

    expect(screen.queryByTestId('tool-call')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown-lite')).toHaveTextContent(
      '<tool>save_file(file=a.py)</tool>',
    );
  });

  test('updates pending tool to completed tool on rerender', () => {
    const { rerender } = render(
      <Text text="<tool>save_file(file=a.py)</tool>" isCreatedByUser={false} showCursor={false} />,
    );

    expect(screen.getByTestId('tool-call')).toHaveAttribute('data-progress', '0.1');

    rerender(
      <Text
        text={'<tool>save_file(file=a.py)\nok</tool>'}
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    const toolCall = screen.getByTestId('tool-call');
    expect(toolCall).toHaveAttribute('data-progress', '1');
    expect(toolCall).toHaveAttribute('data-output', 'ok');
  });

  test('marks pending tool as cancelled when stream is no longer submitting', () => {
    mockUseMessageContext.mockReturnValue({ isSubmitting: false, isLatestMessage: true } as any);

    render(
      <Text text="<tool>save_file(file=a.py)</tool>" isCreatedByUser={false} showCursor={false} />,
    );

    expect(screen.getByTestId('tool-call')).toHaveAttribute('data-state', 'cancelled');
  });

  test('uses markdown fast path when no tool tags are present', () => {
    render(
      <Text
        text={'# Hello World\n\nThis is plain markdown.'}
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    expect(screen.getByTestId('markdown')).toHaveTextContent('# Hello World');
    expect(screen.queryByTestId('tool-call')).not.toBeInTheDocument();
  });

  test('renders tools inside tool-group as separate ToolCall cards', () => {
    render(
      <Text
        text={
          '<tool-group>\n<tool>save_file(file=a.py)\nok</tool>\n\n<tool>run_shell(cmd=pwd)\n/app</tool>\n</tool-group>'
        }
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    const toolCalls = screen.getAllByTestId('tool-call');
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0]).toHaveAttribute('data-name', 'save_file');
    expect(toolCalls[0]).toHaveAttribute('data-output', 'ok');
    expect(toolCalls[1]).toHaveAttribute('data-name', 'run_shell');
    expect(toolCalls[1]).toHaveAttribute('data-output', '/app');
  });

  test('renders unclosed tool fragments as plain markdown text', () => {
    const text = 'Hello <tool>save_file(file=a.py)';
    render(<Text text={text} isCreatedByUser={false} showCursor={false} />);

    expect(screen.queryByTestId('tool-call')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown')).toHaveTextContent(text);
  });

  test('decodes HTML entities in tool args and output before rendering ToolCall', () => {
    render(
      <Text
        text={'<tool>save_file(content=&lt;div&gt;hello&lt;/div&gt;)\n&amp;done</tool>'}
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    const toolCall = screen.getByTestId('tool-call');
    expect(toolCall).toHaveAttribute('data-args', 'save_file(content=<div>hello</div>)');
    expect(toolCall).toHaveAttribute('data-output', '&done');
  });

  test('derives tool name from call even when no parenthesis is present', () => {
    render(<Text text={'<tool>save_file\nok</tool>'} isCreatedByUser={false} showCursor={false} />);

    const toolCall = screen.getByTestId('tool-call');
    expect(toolCall).toHaveAttribute('data-name', 'save_file');
    expect(toolCall).toHaveAttribute('data-args', 'save_file');
  });

  test('falls back to tool name "tool" for empty or invalid call prefix', () => {
    render(<Text text={'<tool>(weird)\nok</tool>'} isCreatedByUser={false} showCursor={false} />);

    const toolCall = screen.getByTestId('tool-call');
    expect(toolCall).toHaveAttribute('data-name', 'tool');
  });

  test('marks the last tool as isLast even when trailing whitespace text is filtered', () => {
    render(
      <Text
        text={'<tool>save_file(file=a.py)\nok</tool>\n\n'}
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    expect(screen.getByTestId('tool-call')).toHaveAttribute('data-last', 'true');
  });

  test('renders inline-code tool tags as markdown text, not ToolCall cards', () => {
    const content = 'Use `<tool>save_file(file=a.py)</tool>` as literal documentation.';
    render(<Text text={content} isCreatedByUser={false} showCursor={false} />);

    expect(screen.queryByTestId('tool-call')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown')).toHaveTextContent(content);
  });

  test('renders fenced-code tool tags as markdown text, not ToolCall cards', () => {
    const content = ['```txt', '<tool>save_file(file=a.py)\nok</tool>', '```'].join('\n');
    render(<Text text={content} isCreatedByUser={false} showCursor={false} />);

    expect(screen.queryByTestId('tool-call')).not.toBeInTheDocument();
    const markdown = screen.getByTestId('markdown');
    expect(markdown.textContent).toContain('```txt');
    expect(markdown.textContent).toContain('<tool>save_file(file=a.py)');
    expect(markdown.textContent).toContain('ok</tool>');
    expect(markdown.textContent).toContain('```');
  });

  test('keeps fenced examples as markdown and renders real tool tag outside fence', () => {
    const content = [
      '```txt',
      '<tool>example_call()',
      'example_result</tool>',
      '```',
      '',
      '<tool>run_shell(cmd=pwd)',
      '/app</tool>',
    ].join('\n');

    render(<Text text={content} isCreatedByUser={false} showCursor={false} />);

    const markdown = screen.getByTestId('markdown');
    expect(markdown.textContent).toContain('```txt');
    expect(markdown.textContent).toContain('<tool>example_call()');
    expect(markdown.textContent).toContain('example_result</tool>');
    expect(markdown.textContent).toContain('```');
    const toolCall = screen.getByTestId('tool-call');
    expect(toolCall).toHaveAttribute('data-name', 'run_shell');
    expect(toolCall).toHaveAttribute('data-output', '/app');
  });
});
