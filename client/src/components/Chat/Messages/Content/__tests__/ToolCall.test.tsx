import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'jotai';
import { Tools, Constants } from 'librechat-data-provider';
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
  default: ({
    onClick,
    inProgressText,
    finishedText,
    error,
    progress,
    subtitle,
  }: {
    onClick?: () => void;
    inProgressText?: string;
    finishedText?: string;
    error?: string;
    progress: number;
    subtitle?: string;
  }) => (
    <div data-testid="progress-text" onClick={onClick}>
      {error || progress >= 1 ? finishedText : inProgressText}
      {subtitle && <span data-testid="subtitle">{subtitle}</span>}
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

const mockUseAtomValue = jest.fn().mockReturnValue(undefined);
const mockClearProgress = jest.fn();

jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useAtomValue: (...args: any[]) => mockUseAtomValue(...args),
  useSetAtom: () => mockClearProgress,
}));

const DUMMY_ATOM = { toString: () => 'dummy-atom' };

jest.mock('~/store/progress', () => ({
  toolCallProgressFamily: jest.fn().mockReturnValue(DUMMY_ATOM),
  clearToolCallProgressAtom: {},
}));

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useRecoilValue: jest.fn().mockReturnValue(false),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    autoExpandTools: 'autoExpandTools',
  },
}));

describe('ToolCall', () => {
  const mockProps = {
    args: '{"test": "input"}',
    name: 'testFunction',
    output: 'Test output',
    initialProgress: 1,
    isSubmitting: false,
  };

  const renderWithJotai = (component: React.ReactElement) => {
    return render(<Provider>{component}</Provider>);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAtomValue.mockReturnValue(undefined);
    mockClearProgress.mockClear();
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

      renderWithJotai(<ToolCall {...mockProps} attachments={attachments} />);

      fireEvent.click(screen.getByTestId('progress-text'));

      const toolCallInfo = screen.getByTestId('tool-call-info');
      expect(toolCallInfo).toBeInTheDocument();

      const attachmentsData = toolCallInfo.getAttribute('data-attachments');
      expect(attachmentsData).toBe(JSON.stringify(attachments));
    });

    it('should pass empty array when no attachments', () => {
      renderWithJotai(<ToolCall {...mockProps} />);

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

      renderWithJotai(<ToolCall {...mockProps} attachments={attachments} />);

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

      renderWithJotai(<ToolCall {...mockProps} attachments={attachments} />);

      const attachmentGroup = screen.getByTestId('attachment-group');
      expect(attachmentGroup).toBeInTheDocument();
      expect(attachmentGroup.textContent).toBe(JSON.stringify(attachments));
    });

    it('should not render AttachmentGroup when no attachments', () => {
      renderWithJotai(<ToolCall {...mockProps} />);

      expect(screen.queryByTestId('attachment-group')).not.toBeInTheDocument();
    });

    it('should not render AttachmentGroup when attachments is empty array', () => {
      renderWithJotai(<ToolCall {...mockProps} attachments={[]} />);

      expect(screen.queryByTestId('attachment-group')).not.toBeInTheDocument();
    });
  });

  describe('tool call info visibility', () => {
    it('should toggle tool call info expand/collapse when clicking header', () => {
      renderWithJotai(<ToolCall {...mockProps} />);

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

    it('should pass all required props to ToolCallInfo', () => {
      const attachments = [
        {
          type: Tools.ui_resources,
          messageId: 'msg123',
          toolCallId: 'tool456',
          conversationId: 'conv789',
          [Tools.ui_resources]: {
            '0': { type: 'button', label: 'Test' },
          },
        },
      ];

      // Use a name with domain separator (_action_) and domain separator (---)
      const propsWithDomain = {
        ...mockProps,
        name: 'testFunction_action_test---domain---com',
        attachments,
      };

      renderWithJotai(<ToolCall {...propsWithDomain} />);

      fireEvent.click(screen.getByTestId('progress-text'));

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

      renderWithJotai(
        <ToolCall
          {...mockProps}
          output={undefined}
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
      renderWithJotai(
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
      renderWithJotai(
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
      renderWithJotai(<ToolCall {...mockProps} args={undefined} />);

      fireEvent.click(screen.getByTestId('progress-text'));

      const toolCallInfo = screen.getByTestId('tool-call-info');
      const props = JSON.parse(toolCallInfo.textContent!);
      expect(props.input).toBe('');
    });

    it('should handle null output', () => {
      renderWithJotai(<ToolCall {...mockProps} output={null} />);

      const toolCallInfo = screen.getByTestId('tool-call-info');
      const props = JSON.parse(toolCallInfo.textContent!);
      expect(props.output).toBeNull();
    });

    it('should handle missing domain', () => {
      renderWithJotai(<ToolCall {...mockProps} domain={undefined} authDomain={undefined} />);

      fireEvent.click(screen.getByTestId('progress-text'));

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

      renderWithJotai(<ToolCall {...mockProps} attachments={complexAttachments} />);

      fireEvent.click(screen.getByTestId('progress-text'));

      const toolCallInfo = screen.getByTestId('tool-call-info');
      const attachmentsData = toolCallInfo.getAttribute('data-attachments');
      expect(JSON.parse(attachmentsData!)).toEqual(complexAttachments);

      const attachmentGroup = screen.getByTestId('attachment-group');
      expect(JSON.parse(attachmentGroup.textContent!)).toEqual(complexAttachments);
    });
  });

  describe('MCP OAuth detection', () => {
    const d = Constants.mcp_delimiter;

    it('should detect MCP OAuth from delimiter in tool-call name', () => {
      renderWithJotai(
        <ToolCall
          {...mockProps}
          name={`oauth${d}my-server`}
          initialProgress={0.5}
          isSubmitting={true}
          auth="https://auth.example.com"
        />,
      );
      const subtitle = screen.getByTestId('subtitle');
      expect(subtitle.textContent).toBe('via my-server');
    });

    it('should preserve full server name when it contains the delimiter substring', () => {
      renderWithJotai(
        <ToolCall
          {...mockProps}
          name={`oauth${d}foo${d}bar`}
          initialProgress={0.5}
          isSubmitting={true}
          auth="https://auth.example.com"
        />,
      );
      const subtitle = screen.getByTestId('subtitle');
      expect(subtitle.textContent).toBe(`via foo${d}bar`);
    });

    it('should display server name (not "oauth") as function_name for OAuth tool calls', () => {
      renderWithJotai(
        <ToolCall
          {...mockProps}
          name={`oauth${d}my-server`}
          initialProgress={1}
          isSubmitting={false}
          output="done"
          auth="https://auth.example.com"
        />,
      );
      const progressText = screen.getByTestId('progress-text');
      expect(progressText.textContent).toContain('Completed my-server');
      expect(progressText.textContent).not.toContain('Completed oauth');
    });

    it('should display server name even when auth is cleared (post-completion)', () => {
      // After OAuth completes, createOAuthEnd re-emits the toolCall without auth.
      // The display should still show the server name, not literal "oauth".
      renderWithJotai(
        <ToolCall
          {...mockProps}
          name={`oauth${d}my-server`}
          initialProgress={1}
          isSubmitting={false}
          output="done"
        />,
      );
      const progressText = screen.getByTestId('progress-text');
      expect(progressText.textContent).toContain('Completed my-server');
      expect(progressText.textContent).not.toContain('Completed oauth');
    });

    it('should fallback to auth URL redirect_uri when name lacks delimiter', () => {
      const authUrl =
        'https://oauth.example.com/authorize?redirect_uri=' +
        encodeURIComponent('https://app.example.com/api/mcp/my-server/oauth/callback');
      renderWithJotai(
        <ToolCall
          {...mockProps}
          name="bare_name"
          initialProgress={0.5}
          isSubmitting={true}
          auth={authUrl}
        />,
      );
      const subtitle = screen.getByTestId('subtitle');
      expect(subtitle.textContent).toBe('via my-server');
    });

    it('should display server name (not raw tool-call ID) in fallback path finished text', () => {
      const authUrl =
        'https://oauth.example.com/authorize?redirect_uri=' +
        encodeURIComponent('https://app.example.com/api/mcp/my-server/oauth/callback');
      renderWithJotai(
        <ToolCall
          {...mockProps}
          name="bare_name"
          initialProgress={1}
          isSubmitting={false}
          output="done"
          auth={authUrl}
        />,
      );
      const progressText = screen.getByTestId('progress-text');
      expect(progressText.textContent).toContain('Completed my-server');
      expect(progressText.textContent).not.toContain('bare_name');
    });

    it('should show normalized server name when it contains _mcp_ after prefixing', () => {
      // Server named oauth@mcp@server normalizes to oauth_mcp_server,
      // gets prefixed to oauth_mcp_oauth_mcp_server. Client parses:
      // func="oauth", server="oauth_mcp_server". Visually awkward but
      // semantically correct — the normalized name IS oauth_mcp_server.
      renderWithJotai(
        <ToolCall
          {...mockProps}
          name={`oauth${d}oauth${d}server`}
          initialProgress={0.5}
          isSubmitting={true}
          auth="https://auth.example.com"
        />,
      );
      const subtitle = screen.getByTestId('subtitle');
      expect(subtitle.textContent).toBe(`via oauth${d}server`);
    });

    it('should not misidentify non-MCP action auth as MCP via fallback', () => {
      const authUrl =
        'https://oauth.example.com/authorize?redirect_uri=' +
        encodeURIComponent('https://app.example.com/api/actions/xyz/oauth/callback');
      renderWithJotai(
        <ToolCall
          {...mockProps}
          name="action_name"
          initialProgress={0.5}
          isSubmitting={true}
          auth={authUrl}
        />,
      );
      expect(screen.queryByTestId('subtitle')).not.toBeInTheDocument();
    });
  });

  describe('A11Y-04: screen reader status announcements', () => {
    it('includes sr-only aria-live region for status announcements', () => {
      renderWithJotai(
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

  describe('getInProgressText - MCP progress display', () => {
    it('shows mcpProgress.message when available', () => {
      mockUseAtomValue.mockReturnValue({
        progress: 2,
        total: 10,
        message: 'Fetching data from API...',
        timestamp: Date.now(),
      });

      renderWithJotai(
        <ToolCall
          {...mockProps}
          output={undefined}
          initialProgress={0.1}
          isSubmitting={true}
          toolCallId="call-123"
        />,
      );

      expect(screen.getByTestId('progress-text')).toHaveTextContent('Fetching data from API...');
    });

    it('shows "functionName: X/Y" when mcpProgress has total but no message', () => {
      mockUseAtomValue.mockReturnValue({
        progress: 3,
        total: 10,
        timestamp: Date.now(),
      });

      renderWithJotai(
        <ToolCall
          {...mockProps}
          output={undefined}
          initialProgress={0.1}
          isSubmitting={true}
          toolCallId="call-123"
        />,
      );

      expect(screen.getByTestId('progress-text')).toHaveTextContent('testFunction: 3/10');
    });

    it('falls back to running_var localisation when no mcpProgress', () => {
      mockUseAtomValue.mockReturnValue(undefined);

      renderWithJotai(
        <ToolCall {...mockProps} output={undefined} initialProgress={0.1} isSubmitting={true} />,
      );

      expect(screen.getByTestId('progress-text')).toHaveTextContent('Running testFunction');
    });

    it('prefers message over progress/total when both are present', () => {
      mockUseAtomValue.mockReturnValue({
        progress: 5,
        total: 10,
        message: 'Custom status message',
        timestamp: Date.now(),
      });

      renderWithJotai(
        <ToolCall
          {...mockProps}
          output={undefined}
          initialProgress={0.1}
          isSubmitting={true}
          toolCallId="call-123"
        />,
      );

      expect(screen.getByTestId('progress-text')).toHaveTextContent('Custom status message');
      expect(screen.getByTestId('progress-text')).not.toHaveTextContent('testFunction: 5/10');
    });
  });

  describe('toolCallId prop and progress atom integration', () => {
    it('passes toolCallId to toolCallProgressFamily when provided', () => {
      const { toolCallProgressFamily } = jest.requireMock('~/store/progress');

      renderWithJotai(<ToolCall {...mockProps} toolCallId="specific-call-id" />);

      expect(toolCallProgressFamily).toHaveBeenCalledWith('specific-call-id');
    });

    it('passes empty string to toolCallProgressFamily when toolCallId is undefined', () => {
      const { toolCallProgressFamily } = jest.requireMock('~/store/progress');

      renderWithJotai(<ToolCall {...mockProps} />);

      expect(toolCallProgressFamily).toHaveBeenCalledWith('');
    });

    it('calls clearProgress with toolCallId when output arrives', () => {
      mockUseAtomValue.mockReturnValue(mockClearProgress);

      renderWithJotai(
        <ToolCall {...mockProps} output="Tool completed" toolCallId="call-to-clear" />,
      );

      expect(mockClearProgress).toHaveBeenCalledWith('call-to-clear');
    });

    it('does not call clearProgress when toolCallId is undefined', () => {
      mockUseAtomValue.mockReturnValue(mockClearProgress);

      renderWithJotai(<ToolCall {...mockProps} output="Tool completed" />);

      expect(mockClearProgress).not.toHaveBeenCalled();
    });
  });

  describe('cancelled state with hasOutput', () => {
    it('is not cancelled when output exists even with low progress', () => {
      renderWithJotai(
        <ToolCall {...mockProps} output="Result" initialProgress={0.1} isSubmitting={false} />,
      );

      // When not cancelled and has output → shows finished text, not "Cancelled"
      expect(screen.queryByTestId('progress-text')).not.toHaveTextContent('Cancelled');
      expect(screen.queryByTestId('progress-text')).toHaveTextContent('Completed testFunction');
    });

    it('is cancelled when no output and not submitting and progress < 1', () => {
      renderWithJotai(
        <ToolCall {...mockProps} output={undefined} initialProgress={0.1} isSubmitting={false} />,
      );

      expect(screen.getByTestId('progress-text')).toHaveTextContent('Cancelled');
    });

    it('shows finished text when progress is 1 and output is present', () => {
      renderWithJotai(
        <ToolCall {...mockProps} output="Done" initialProgress={1} isSubmitting={false} />,
      );

      expect(screen.getByTestId('progress-text')).toHaveTextContent('Completed testFunction');
    });
  });
});
