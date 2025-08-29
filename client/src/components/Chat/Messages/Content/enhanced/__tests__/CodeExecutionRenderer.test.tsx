import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecoilRoot } from 'recoil';
import { Tools, AuthType } from 'librechat-data-provider';
import CodeExecutionRenderer from '../CodeExecutionRenderer';
import { useVerifyAgentToolAuth, useToolCallMutation } from '~/data-provider';
import { useCodeApiKeyForm } from '~/hooks';
import { MessageContext } from '~/Providers';

// Mock dependencies
jest.mock('~/data-provider', () => ({
  useVerifyAgentToolAuth: jest.fn(),
  useToolCallMutation: jest.fn(),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useCodeApiKeyForm: jest.fn(),
}));

jest.mock('@librechat/client', () => ({
  Spinner: ({ className }: { className?: string }) => <div className={className} data-testid="spinner" />,
  useToastContext: () => ({
    showToast: jest.fn(),
  }),
}));

jest.mock('~/utils', () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(' '),
  normalizeLanguage: (lang: string) => lang,
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => {
  return function MarkdownLite({ content }: { content: string }) {
    return <div data-testid="markdown-lite">{content}</div>;
  };
});

jest.mock('~/components/SidePanel/Agents/Code/ApiKeyDialog', () => {
  return function ApiKeyDialog({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
    return isOpen ? (
      <div data-testid="api-key-dialog">
        <button onClick={() => onOpenChange(false)}>Close</button>
      </div>
    ) : null;
  };
});

const mockUseVerifyAgentToolAuth = useVerifyAgentToolAuth as jest.MockedFunction<typeof useVerifyAgentToolAuth>;
const mockUseToolCallMutation = useToolCallMutation as jest.MockedFunction<typeof useToolCallMutation>;
const mockUseCodeApiKeyForm = useCodeApiKeyForm as jest.MockedFunction<typeof useCodeApiKeyForm>;

describe('CodeExecutionRenderer', () => {
  let queryClient: QueryClient;
  let mockExecute: {
    mutate: jest.Mock;
    isLoading: boolean;
  };
  let mockCodeApiKeyForm: {
    methods: { register: jest.Mock; handleSubmit: jest.Mock };
    onSubmit: jest.Mock;
    isDialogOpen: boolean;
    setIsDialogOpen: jest.Mock;
    handleRevokeApiKey: jest.Mock;
  };

  const mockMessageContext = {
    messageId: 'test-message-id',
    conversationId: 'test-conversation-id',
    partIndex: 0,
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    mockExecute = {
      mutate: jest.fn(),
      isLoading: false,
    };

    mockCodeApiKeyForm = {
      methods: {
        register: jest.fn(),
        handleSubmit: jest.fn(),
      },
      onSubmit: jest.fn(),
      isDialogOpen: false,
      setIsDialogOpen: jest.fn(),
      handleRevokeApiKey: jest.fn(),
    };

    mockUseVerifyAgentToolAuth.mockReturnValue({
      data: { authenticated: true, message: AuthType.USER_PROVIDED },
    } as any);

    mockUseToolCallMutation.mockReturnValue(mockExecute as any);
    mockUseCodeApiKeyForm.mockReturnValue(mockCodeApiKeyForm as any);

    jest.clearAllMocks();
  });

  const renderComponent = (props = {}) => {
    const defaultProps = {
      code: 'print("Hello, World!")',
      language: 'python',
      ...props,
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <RecoilRoot>
          <MessageContext.Provider value={mockMessageContext as any}>
            <CodeExecutionRenderer {...defaultProps} />
          </MessageContext.Provider>
        </RecoilRoot>
      </QueryClientProvider>
    );
  };

  describe('Rendering', () => {
    it('renders code execution component with header and code', () => {
      renderComponent();

      expect(screen.getByText('com_ui_code_execution (python)')).toBeInTheDocument();
      expect(screen.getByText('com_ui_execute')).toBeInTheDocument();
      expect(screen.getByTestId('markdown-lite')).toBeInTheDocument();
    });

    it('displays the correct language in header', () => {
      renderComponent({ language: 'javascript' });

      expect(screen.getByText('com_ui_code_execution (javascript)')).toBeInTheDocument();
    });

    it('renders execute button when not executing', () => {
      renderComponent();

      const executeButton = screen.getByRole('button', { name: /com_ui_execute/i });
      expect(executeButton).toBeInTheDocument();
      expect(executeButton).not.toBeDisabled();
    });

    it('renders stop button when executing', () => {
      mockExecute.isLoading = true;
      renderComponent();

      expect(screen.getByText('com_ui_stop')).toBeInTheDocument();
    });
  });

  describe('Authentication', () => {
    it('opens API key dialog when not authenticated', () => {
      mockUseVerifyAgentToolAuth.mockReturnValue({
        data: { authenticated: false, message: false },
      } as any);

      renderComponent();

      const executeButton = screen.getByRole('button', { name: /com_ui_execute/i });
      fireEvent.click(executeButton);

      expect(mockCodeApiKeyForm.setIsDialogOpen).toHaveBeenCalledWith(true);
      expect(mockExecute.mutate).not.toHaveBeenCalled();
    });

    it('executes code when authenticated', () => {
      renderComponent();

      const executeButton = screen.getByRole('button', { name: /com_ui_execute/i });
      fireEvent.click(executeButton);

      expect(mockExecute.mutate).toHaveBeenCalledWith({
        partIndex: 0,
        messageId: 'test-message-id',
        blockIndex: 0,
        conversationId: 'test-conversation-id',
        lang: 'python',
        code: 'print("Hello, World!")',
      });
    });

    it('shows API key dialog when isDialogOpen is true', () => {
      mockCodeApiKeyForm.isDialogOpen = true;
      renderComponent();

      expect(screen.getByTestId('api-key-dialog')).toBeInTheDocument();
    });
  });

  describe('Code Execution', () => {
    it('shows executing state during execution', () => {
      mockExecute.isLoading = true;
      renderComponent();

      expect(screen.getByText('com_ui_executing_code...')).toBeInTheDocument();
      expect(screen.getByTestId('spinner')).toBeInTheDocument();
    });

    it('handles successful execution', async () => {
      // Mock the mutation to simulate success
      mockUseToolCallMutation.mockReturnValue({
        ...mockExecute,
        mutate: jest.fn((params, options) => {
          // Simulate async success
          setTimeout(() => {
            options?.onSuccess?.({ result: 'Hello, World!' });
          }, 0);
        }),
      } as any);

      renderComponent();

      const executeButton = screen.getByRole('button', { name: /com_ui_execute/i });
      fireEvent.click(executeButton);

      await waitFor(() => {
        expect(screen.getByText('com_ui_output')).toBeInTheDocument();
        expect(screen.getByText('Hello, World!')).toBeInTheDocument();
      });
    });

    it('handles execution error', async () => {
      // Mock the mutation to simulate error
      mockUseToolCallMutation.mockReturnValue({
        ...mockExecute,
        mutate: jest.fn((params, options) => {
          // Simulate async error
          setTimeout(() => {
            options?.onError?.(new Error('Execution failed'));
          }, 0);
        }),
      } as any);

      renderComponent();

      const executeButton = screen.getByRole('button', { name: /com_ui_execute/i });
      fireEvent.click(executeButton);

      await waitFor(() => {
        expect(screen.getByText('com_ui_error')).toBeInTheDocument();
        expect(screen.getByText('Execution failed')).toBeInTheDocument();
      });
    });

    it('shows execution time in results', async () => {
      // Mock the mutation to simulate success with delay
      mockUseToolCallMutation.mockReturnValue({
        ...mockExecute,
        mutate: jest.fn((params, options) => {
          // Simulate async success with delay
          setTimeout(() => {
            options?.onSuccess?.({ result: 'Success' });
          }, 50);
        }),
      } as any);

      renderComponent();

      const executeButton = screen.getByRole('button', { name: /com_ui_execute/i });
      fireEvent.click(executeButton);

      await waitFor(() => {
        expect(screen.getByText('com_ui_output')).toBeInTheDocument();
        expect(screen.getByText('Success')).toBeInTheDocument();
        // Should show execution time (parentheses with time)
        expect(screen.getByText(/\(\d+ms\)|\(\d+\.\d+s\)/)).toBeInTheDocument();
      });
    });

    it('handles timeout after 10 seconds', async () => {
      jest.useFakeTimers();
      
      renderComponent();

      const executeButton = screen.getByRole('button', { name: /com_ui_execute/i });
      fireEvent.click(executeButton);

      // Fast-forward 10 seconds
      jest.advanceTimersByTime(10000);

      await waitFor(() => {
        expect(screen.getByText('com_ui_error')).toBeInTheDocument();
        expect(screen.getByText('com_ui_code_execution_timeout')).toBeInTheDocument();
      });

      jest.useRealTimers();
    });

    it('can stop execution manually', async () => {
      mockExecute.isLoading = true;
      renderComponent();

      const stopButton = screen.getByRole('button', { name: /com_ui_stop/i });
      fireEvent.click(stopButton);

      await waitFor(() => {
        expect(screen.getByText('com_ui_error')).toBeInTheDocument();
        expect(screen.getByText('com_ui_code_execution_stopped')).toBeInTheDocument();
      });
    });
  });

  describe('Input Validation', () => {
    it('shows error for empty code', () => {
      renderComponent({ code: '' });

      const executeButton = screen.getByRole('button', { name: /com_ui_execute/i });
      expect(executeButton).toBeDisabled();
    });

    it('shows error for invalid language', () => {
      renderComponent({ language: '' });

      const executeButton = screen.getByRole('button', { name: /com_ui_execute/i });
      fireEvent.click(executeButton);

      // Should not call mutate with invalid language
      expect(mockExecute.mutate).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels and roles', () => {
      renderComponent();

      const executeButton = screen.getByRole('button', { name: /com_ui_execute/i });
      expect(executeButton).toBeInTheDocument();

      const codeContainer = screen.getByTestId('markdown-lite');
      expect(codeContainer).toBeInTheDocument();
    });

    it('supports keyboard navigation', () => {
      renderComponent();

      const executeButton = screen.getByRole('button', { name: /com_ui_execute/i });
      executeButton.focus();
      expect(executeButton).toHaveFocus();

      fireEvent.keyDown(executeButton, { key: 'Enter' });
      expect(mockExecute.mutate).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('handles network errors gracefully', async () => {
      // Mock the mutation to simulate network error
      mockUseToolCallMutation.mockReturnValue({
        ...mockExecute,
        mutate: jest.fn((params, options) => {
          // Simulate async network error
          setTimeout(() => {
            options?.onError?.(new Error('Network error'));
          }, 0);
        }),
      } as any);

      renderComponent();

      const executeButton = screen.getByRole('button', { name: /com_ui_execute/i });
      fireEvent.click(executeButton);

      await waitFor(() => {
        expect(screen.getByText('com_ui_error')).toBeInTheDocument();
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('cleans up timeout on unmount', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      
      const { unmount } = renderComponent();
      
      const executeButton = screen.getByRole('button', { name: /com_ui_execute/i });
      fireEvent.click(executeButton);
      
      unmount();
      
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('Integration with LibreChat APIs', () => {
    it('calls useVerifyAgentToolAuth with correct parameters', () => {
      renderComponent();

      expect(mockUseVerifyAgentToolAuth).toHaveBeenCalledWith(
        { toolId: Tools.execute_code },
        { retry: 1 }
      );
    });

    it('calls useToolCallMutation with correct tool ID', () => {
      renderComponent();

      expect(mockUseToolCallMutation).toHaveBeenCalledWith(
        Tools.execute_code,
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });

    it('uses message context correctly', () => {
      renderComponent();

      const executeButton = screen.getByRole('button', { name: /com_ui_execute/i });
      fireEvent.click(executeButton);

      expect(mockExecute.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'test-message-id',
          conversationId: 'test-conversation-id',
          partIndex: 0,
        })
      );
    });
  });
});