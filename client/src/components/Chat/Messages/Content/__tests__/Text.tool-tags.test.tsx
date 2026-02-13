import { render, screen } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import TextPart from '../Parts/Text';

// Mock useMessageContext — variable name starts with "mock" so Jest allows it
const mockMessageContext = {
  isSubmitting: false,
  isLatestMessage: true,
};

jest.mock('~/Providers', () => ({
  useMessageContext: () => mockMessageContext,
}));

jest.mock('~/store', () => {
  const { atom } = require('recoil');
  return {
    __esModule: true,
    default: {
      enableUserMsgMarkdown: atom({ key: 'enableUserMsgMarkdown_test', default: false }),
    },
  };
});

jest.mock('~/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}));

// Mock Markdown to render content as plain text for testing
jest.mock('~/components/Chat/Messages/Content/Markdown', () => {
  const { memo, createElement } = require('react');
  return {
    __esModule: true,
    default: memo(({ content }: { content: string }) =>
      createElement('div', { 'data-testid': 'markdown' }, content),
    ),
  };
});

jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => {
  const { memo, createElement } = require('react');
  return {
    __esModule: true,
    default: memo(({ content }: { content: string }) =>
      createElement('div', { 'data-testid': 'markdown-lite' }, content),
    ),
  };
});

// Mock ToolCall to expose its props for testing
jest.mock('~/components/Chat/Messages/Content/ToolCall', () => {
  const { createElement } = require('react');
  return {
    __esModule: true,
    default: ({
      name,
      args,
      output,
      initialProgress,
      isSubmitting: _isSubmitting,
    }: {
      name: string;
      args: string;
      output?: string;
      initialProgress: number;
      isSubmitting: boolean;
      isLast?: boolean;
    }) =>
      createElement(
        'div',
        {
          'data-testid': 'tool-call',
          'data-name': name,
          'data-args': args,
          'data-output': output ?? '',
          'data-progress': initialProgress,
          'data-submitting': _isSubmitting,
        },
        `ToolCall: ${name}`,
      ),
  };
});

const renderTextPart = (props: { text: string; isCreatedByUser: boolean; showCursor?: boolean }) =>
  render(
    <RecoilRoot>
      <TextPart text={props.text} isCreatedByUser={props.isCreatedByUser} showCursor={props.showCursor ?? false} />
    </RecoilRoot>,
  );

describe('TextPart tool tag rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMessageContext.isSubmitting = false;
    mockMessageContext.isLatestMessage = true;
  });

  describe('pending tool rendering', () => {
    it('should render a pending tool as a ToolCall card (no raw <tool> visible)', () => {
      renderTextPart({
        text: '<tool>save_file(file=a.py)</tool>',
        isCreatedByUser: false,
      });

      const toolCall = screen.getByTestId('tool-call');
      expect(toolCall).toBeInTheDocument();
      expect(toolCall).toHaveAttribute('data-name', 'save_file');
      expect(toolCall).toHaveAttribute('data-args', 'save_file(file=a.py)');
      expect(toolCall).toHaveAttribute('data-progress', '0.1');

      // No raw <tool> tag visible
      expect(screen.queryByText(/<tool>/)).not.toBeInTheDocument();
    });
  });

  describe('completed tool rendering', () => {
    it('should render a completed tool with output in ToolCall card', () => {
      renderTextPart({
        text: '<tool>save_file(file=a.py)\nok</tool>',
        isCreatedByUser: false,
      });

      const toolCall = screen.getByTestId('tool-call');
      expect(toolCall).toBeInTheDocument();
      expect(toolCall).toHaveAttribute('data-name', 'save_file');
      expect(toolCall).toHaveAttribute('data-output', 'ok');
      expect(toolCall).toHaveAttribute('data-progress', '1');
    });

    it('should render a completed tool with empty result as completed state', () => {
      renderTextPart({
        text: '<tool>save_file(file=a.py)\n</tool>',
        isCreatedByUser: false,
      });

      const toolCall = screen.getByTestId('tool-call');
      expect(toolCall).toBeInTheDocument();
      expect(toolCall).toHaveAttribute('data-progress', '1');
      expect(toolCall).toHaveAttribute('data-output', '');
    });
  });

  describe('consecutive tools', () => {
    it('should render multiple consecutive tools as separate cards', () => {
      renderTextPart({
        text: '<tool>save_file(file=a.py)\nok</tool>\n\n<tool>run_shell(cmd=pwd)\n/app</tool>',
        isCreatedByUser: false,
      });

      const toolCalls = screen.getAllByTestId('tool-call');
      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0]).toHaveAttribute('data-name', 'save_file');
      expect(toolCalls[1]).toHaveAttribute('data-name', 'run_shell');
    });
  });

  describe('mixed text + tool content', () => {
    it('should preserve surrounding markdown when tools are present', () => {
      renderTextPart({
        text: 'Here is some text\n\n<tool>run_shell(cmd=ls)\nfile1.txt</tool>\n\nMore text after',
        isCreatedByUser: false,
      });

      // Should have markdown segments for text
      const markdownElements = screen.getAllByTestId('markdown');
      expect(markdownElements.length).toBeGreaterThanOrEqual(2);
      expect(markdownElements[0].textContent).toBe('Here is some text\n\n');
      expect(markdownElements[markdownElements.length - 1].textContent).toBe('\n\nMore text after');

      // Should have tool call card
      const toolCall = screen.getByTestId('tool-call');
      expect(toolCall).toHaveAttribute('data-name', 'run_shell');
    });
  });

  describe('user message path', () => {
    it('should not parse tool tags for user messages', () => {
      renderTextPart({
        text: '<tool>save_file(file=a.py)</tool>',
        isCreatedByUser: true,
      });

      // Should not render ToolCall
      expect(screen.queryByTestId('tool-call')).not.toBeInTheDocument();

      // User messages without markdown enabled render as plain text
      expect(screen.getByText('<tool>save_file(file=a.py)</tool>')).toBeInTheDocument();
    });
  });

  describe('pending → completed transition', () => {
    it('should re-render from pending to completed when text updates', () => {
      const { rerender } = render(
        <RecoilRoot>
          <TextPart
            text="<tool>save_file(file=a.py)</tool>"
            isCreatedByUser={false}
            showCursor={false}
          />
        </RecoilRoot>,
      );

      // Initially pending
      let toolCall = screen.getByTestId('tool-call');
      expect(toolCall).toHaveAttribute('data-progress', '0.1');

      // Re-render with completed text
      rerender(
        <RecoilRoot>
          <TextPart
            text="<tool>save_file(file=a.py)
ok</tool>"
            isCreatedByUser={false}
            showCursor={false}
          />
        </RecoilRoot>,
      );

      // Now completed
      toolCall = screen.getByTestId('tool-call');
      expect(toolCall).toHaveAttribute('data-progress', '1');
      expect(toolCall).toHaveAttribute('data-output', 'ok');
    });
  });

  describe('pending tool with isSubmitting=false (cancelled)', () => {
    it('should render pending tool with isSubmitting=false (existing ToolCall shows cancelled)', () => {
      mockMessageContext.isSubmitting = false;

      renderTextPart({
        text: '<tool>save_file(file=a.py)</tool>',
        isCreatedByUser: false,
      });

      const toolCall = screen.getByTestId('tool-call');
      expect(toolCall).toHaveAttribute('data-progress', '0.1');
      expect(toolCall).toHaveAttribute('data-submitting', 'false');
    });
  });

  describe('normal markdown (no tools)', () => {
    it('should render plain markdown normally when no tool tags present', () => {
      renderTextPart({
        text: '# Hello World\n\nSome paragraph text',
        isCreatedByUser: false,
      });

      const markdown = screen.getByTestId('markdown');
      expect(markdown).toBeInTheDocument();
      expect(markdown.textContent).toBe('# Hello World\n\nSome paragraph text');

      // No tool calls rendered
      expect(screen.queryByTestId('tool-call')).not.toBeInTheDocument();
    });
  });

  describe('tool-group rendering', () => {
    it('should render tool-group tools as individual ToolCall cards', () => {
      const text = `<tool-group>
<tool>save_file(file=a.py)
ok</tool>

<tool>run_shell(cmd=pwd)
/app</tool>
</tool-group>`;

      renderTextPart({ text, isCreatedByUser: false });

      const toolCalls = screen.getAllByTestId('tool-call');
      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0]).toHaveAttribute('data-name', 'save_file');
      expect(toolCalls[0]).toHaveAttribute('data-output', 'ok');
      expect(toolCalls[1]).toHaveAttribute('data-name', 'run_shell');
      expect(toolCalls[1]).toHaveAttribute('data-output', '/app');
    });
  });

  describe('HTML entity handling', () => {
    it('should decode HTML entities in tool content', () => {
      renderTextPart({
        text: '<tool>save_file(content=&lt;div&gt;hello&lt;/div&gt;)\n&amp;done</tool>',
        isCreatedByUser: false,
      });

      const toolCall = screen.getByTestId('tool-call');
      expect(toolCall).toHaveAttribute('data-args', 'save_file(content=<div>hello</div>)');
      expect(toolCall).toHaveAttribute('data-output', '&done');
    });
  });

  describe('streaming fragment (unclosed tag)', () => {
    it('should render unclosed tool tag as plain text via Markdown', () => {
      renderTextPart({
        text: 'Hello <tool>save_file(file=a.py)',
        isCreatedByUser: false,
      });

      // No tool call should be rendered (unclosed tag = plain text)
      expect(screen.queryByTestId('tool-call')).not.toBeInTheDocument();

      // Should be rendered as markdown text segments
      const markdownElements = screen.getAllByTestId('markdown');
      expect(markdownElements.length).toBeGreaterThanOrEqual(1);
    });
  });
});
