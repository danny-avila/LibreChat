import React from 'react';
import { RecoilRoot } from 'recoil';
import { Tools } from 'librechat-data-provider';
import { render, screen, fireEvent } from '@testing-library/react';
import ToolCall from '../ToolCall';

// Mock dependencies
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: any) => {
    const translations: Record<string, string> = {
      com_assistants_function_use: `Used ${values?.[0]}`,
      com_assistants_completed_function: `Completed ${values?.[0]}`,
      com_assistants_completed_action: `Completed action on ${values?.[0]}`,
      com_assistants_running_var: `Running ${values?.[0]}`,
      com_assistants_running_action: 'Running action',
      com_ui_sign_in_to_domain: `Sign in to ${values?.[0]}`,
      com_ui_cancelled: 'Cancelled',
      com_ui_requires_auth: 'Requires authentication',
      com_assistants_allow_sites_you_trust: 'Only allow sites you trust',
      com_ui_via_server: `via ${values?.[0]}`,
      com_ui_tool_failed: 'failed',
    };
    return translations[key] || key;
  },
  useProgress: (initialProgress: number) => (initialProgress >= 1 ? 1 : initialProgress),
  useExpandCollapse: (isExpanded: boolean) => ({
    style: {
      display: 'grid',
      gridTemplateRows: isExpanded ? '1fr' : '0fr',
      opacity: isExpanded ? 1 : 0,
    },
    ref: { current: null },
  }),
}));

jest.mock('~/hooks/MCP', () => ({
  useMCPIconMap: () => new Map(),
}));

jest.mock('~/components/Chat/Messages/Content/MessageContent', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="message-content">{content}</div>,
}));

jest.mock('../ToolCallInfo', () => ({
  __esModule: true,
  default: ({ attachments, ...props }: any) => (
    <div data-testid="tool-call-info" data-attachments={JSON.stringify(attachments)}>
      {JSON.stringify(props)}
    </div>
  ),
}));

jest.mock('../ProgressText', () => ({
  __esModule: true,
  default: ({ onClick, inProgressText, finishedText, _error, _hasInput, _isExpanded }: any) => (
    <div data-testid="progress-text" onClick={onClick}>
      {finishedText || inProgressText}
    </div>
  ),
}));

jest.mock('../Parts', () => ({
  AttachmentGroup: ({ attachments }: any) => (
    <div data-testid="attachment-group">{JSON.stringify(attachments)}</div>
  ),
}));

jest.mock('@librechat/client', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('lucide-react', () => ({
  ChevronDown: () => <span>{'ChevronDown'}</span>,
  ChevronUp: () => <span>{'ChevronUp'}</span>,
  TriangleAlert: () => <span>{'TriangleAlert'}</span>,
}));

jest.mock('~/utils', () => ({
  logger: {
    error: jest.fn(),
  },
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}));

describe('ToolCall', () => {
  const mockProps = {
    args: '{"test": "input"}',
    name: 'testFunction',
    output: 'Test output',
    initialProgress: 1,
    isSubmitting: false,
  };

  const renderWithRecoil = (component: React.ReactElement) => {
    return render(<RecoilRoot>{component}</RecoilRoot>);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('attachments prop passing', () => {
    it('should pass attachments to ToolCallInfo when provided', () => {
      const attachments = [
        {
          type: Tools.ui_resources,
          messageId: 'msg123',
          toolCallId: 'tool456',
          conversationId: 'conv789',
          [Tools.ui_resources]: {
            '0': { type: 'button', label: 'Click me' },
          },
        },
      ];

      renderWithRecoil(<ToolCall {...mockProps} attachments={attachments as any} />);

      fireEvent.click(screen.getByTestId('progress-text'));

      const toolCallInfo = screen.getByTestId('tool-call-info');
      expect(toolCallInfo).toBeInTheDocument();

      const attachmentsData = toolCallInfo.getAttribute('data-attachments');
      expect(attachmentsData).toBe(JSON.stringify(attachments));
    });

    it('should pass empty array when no attachments', () => {
      renderWithRecoil(<ToolCall {...mockProps} />);

      fireEvent.click(screen.getByTestId('progress-text'));

      const toolCallInfo = screen.getByTestId('tool-call-info');
      const attachmentsData = toolCallInfo.getAttribute('data-attachments');
      expect(attachmentsData).toBeNull(); // JSON.stringify(undefined) returns undefined, so attribute is not set
    });

    it('should pass multiple attachments of different types', () => {
      const attachments = [
        {
          type: Tools.ui_resources,
          messageId: 'msg1',
          toolCallId: 'tool1',
          conversationId: 'conv1',
          [Tools.ui_resources]: {
            '0': { type: 'form', fields: [] },
          },
        },
        {
          type: Tools.web_search,
          messageId: 'msg2',
          toolCallId: 'tool2',
          conversationId: 'conv2',
          [Tools.web_search]: {
            results: ['result1', 'result2'],
          },
        },
      ];

      renderWithRecoil(<ToolCall {...mockProps} attachments={attachments as any} />);

      fireEvent.click(screen.getByTestId('progress-text'));

      const toolCallInfo = screen.getByTestId('tool-call-info');
      const attachmentsData = toolCallInfo.getAttribute('data-attachments');
      expect(JSON.parse(attachmentsData!)).toEqual(attachments);
    });
  });

  describe('attachment group rendering', () => {
    it('should render AttachmentGroup when attachments are provided', () => {
      const attachments = [
        {
          type: Tools.ui_resources,
          messageId: 'msg123',
          toolCallId: 'tool456',
          conversationId: 'conv789',
          [Tools.ui_resources]: {
            '0': { type: 'chart', data: [] },
          },
        },
      ];

      renderWithRecoil(<ToolCall {...mockProps} attachments={attachments as any} />);

      const attachmentGroup = screen.getByTestId('attachment-group');
      expect(attachmentGroup).toBeInTheDocument();
      expect(attachmentGroup.textContent).toBe(JSON.stringify(attachments));
    });

    it('should not render AttachmentGroup when no attachments', () => {
      renderWithRecoil(<ToolCall {...mockProps} />);

      expect(screen.queryByTestId('attachment-group')).not.toBeInTheDocument();
    });

    it('should not render AttachmentGroup when attachments is empty array', () => {
      renderWithRecoil(<ToolCall {...mockProps} attachments={[]} />);

      expect(screen.queryByTestId('attachment-group')).not.toBeInTheDocument();
    });
  });

  describe('tool call info visibility', () => {
    it('should toggle tool call info expand/collapse when clicking header', () => {
      renderWithRecoil(<ToolCall {...mockProps} />);

      // ToolCallInfo is always in the DOM (CSS expand/collapse), but initially collapsed
      const toolCallInfo = screen.getByTestId('tool-call-info');
      expect(toolCallInfo).toBeInTheDocument();

      // The expand wrapper starts collapsed (showInfo=false, autoExpand=false)
      const expandWrapper = toolCallInfo.closest('[style]')?.parentElement;
      expect(expandWrapper).toBeDefined();

      // Click to expand
      fireEvent.click(screen.getByTestId('progress-text'));
      expect(screen.getByTestId('tool-call-info')).toBeInTheDocument();
    });

    it('should pass input and output props to ToolCallInfo', () => {
      renderWithRecoil(<ToolCall {...mockProps} />);

      const toolCallInfo = screen.getByTestId('tool-call-info');
      const props = JSON.parse(toolCallInfo.textContent!);

      expect(props.input).toBe('{"test": "input"}');
      expect(props.output).toBe('Test output');
    });
  });

  describe('authentication flow', () => {
    it('should show sign-in button when auth URL is provided', () => {
      const originalOpen = window.open;
      window.open = jest.fn();

      renderWithRecoil(
        <ToolCall
          {...mockProps}
          initialProgress={0.5} // Less than 1 so it's not complete
          auth="https://auth.example.com"
          isSubmitting={true} // Should be submitting for auth to show
        />,
      );

      const signInButton = screen.getByText('Sign in to auth.example.com');
      expect(signInButton).toBeInTheDocument();

      fireEvent.click(signInButton);
      expect(window.open).toHaveBeenCalledWith(
        'https://auth.example.com',
        '_blank',
        'noopener,noreferrer',
      );

      window.open = originalOpen;
    });

    it('should not show auth section when cancelled', () => {
      renderWithRecoil(
        <ToolCall
          {...mockProps}
          auth="https://auth.example.com"
          initialProgress={0.5}
          isSubmitting={false} // Not submitting + progress < 1 = cancelled
        />,
      );

      expect(screen.queryByText('Sign in to auth.example.com')).not.toBeInTheDocument();
    });

    it('should not show auth section when progress is complete', () => {
      renderWithRecoil(
        <ToolCall
          {...mockProps}
          auth="https://auth.example.com"
          initialProgress={1}
          isSubmitting={false}
        />,
      );

      expect(screen.queryByText('Sign in to auth.example.com')).not.toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle undefined args', () => {
      renderWithRecoil(<ToolCall {...mockProps} args={undefined as any} />);

      const toolCallInfo = screen.getByTestId('tool-call-info');
      const props = JSON.parse(toolCallInfo.textContent!);
      expect(props.input).toBe('');
    });

    it('should handle null output', () => {
      renderWithRecoil(<ToolCall {...mockProps} output={null} />);

      const toolCallInfo = screen.getByTestId('tool-call-info');
      const props = JSON.parse(toolCallInfo.textContent!);
      expect(props.output).toBeNull();
    });

    it('should handle simple function name without domain', () => {
      renderWithRecoil(<ToolCall {...mockProps} name="simpleName" />);

      const toolCallInfo = screen.getByTestId('tool-call-info');
      expect(toolCallInfo).toBeInTheDocument();
    });

    it('should handle complex nested attachments', () => {
      const complexAttachments = [
        {
          type: Tools.ui_resources,
          messageId: 'msg123',
          toolCallId: 'tool456',
          conversationId: 'conv789',
          [Tools.ui_resources]: {
            '0': {
              type: 'nested',
              data: {
                deep: {
                  value: 'test',
                  array: [1, 2, 3],
                  object: { key: 'value' },
                },
              },
            },
          },
        },
      ];

      renderWithRecoil(<ToolCall {...mockProps} attachments={complexAttachments as any} />);

      fireEvent.click(screen.getByTestId('progress-text'));

      const toolCallInfo = screen.getByTestId('tool-call-info');
      const attachmentsData = toolCallInfo.getAttribute('data-attachments');
      expect(JSON.parse(attachmentsData!)).toEqual(complexAttachments);

      const attachmentGroup = screen.getByTestId('attachment-group');
      expect(JSON.parse(attachmentGroup.textContent!)).toEqual(complexAttachments);
    });
  });

  describe('A11Y-04: screen reader status announcements', () => {
    it('includes sr-only aria-live region for status announcements', () => {
      renderWithRecoil(
        <ToolCall
          {...mockProps}
          initialProgress={1}
          isSubmitting={false}
          name="test_func"
          output="result"
        />,
      );

      const liveRegion = document.querySelector('[aria-live="polite"]');
      expect(liveRegion).not.toBeNull();
      expect(liveRegion!.className).toContain('sr-only');
    });
  });
});
