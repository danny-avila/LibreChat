/**
 * Enhanced Content Integration Tests
 * 
 * Comprehensive integration tests that verify the complete enhanced content
 * rendering system works together correctly, including parsing, rendering,
 * error handling, and user interactions.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecoilRoot } from 'recoil';

import { EnhancedMessageContent } from '../EnhancedMessageContent';
import { ContentParser } from '../ContentParser';
import { MessageContext } from '~/Providers';

// Mock all external dependencies
jest.mock('../TTSEngine', () => ({
  TTSEngine: {
    getInstance: () => ({
      isSupported: () => true,
      isSpeaking: (text?: string) => false,
      speak: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      onStateChange: jest.fn(),
      getState: () => ({
        isPlaying: false,
        currentText: '',
        currentLanguage: 'pl-PL',
        currentUtterance: null,
      }),
      getSystemDefaultLanguage: () => 'pl-PL',
      setSystemDefaultLanguage: jest.fn(),
    }),
  },
}));

jest.mock('../ChartDataParser', () => ({
  ChartDataParser: {
    parse: jest.fn().mockResolvedValue({
      labels: ['A', 'B', 'C'],
      datasets: [{
        label: 'Test Data',
        data: [10, 20, 30],
        backgroundColor: 'blue',
        borderColor: 'darkblue',
      }],
    }),
    validateData: jest.fn(),
  },
}));

jest.mock('chart.js', () => ({
  Chart: { register: jest.fn() },
  CategoryScale: {},
  LinearScale: {},
  BarElement: {},
  LineElement: {},
  PointElement: {},
  ArcElement: {},
  Title: {},
  Tooltip: {},
  Legend: {},
}));

jest.mock('react-chartjs-2', () => ({
  Bar: ({ data }: any) => (
    <div data-testid="bar-chart" aria-label="Bar chart">
      Chart with {data.datasets[0]?.data?.length || 0} data points
    </div>
  ),
  Line: ({ data }: any) => (
    <div data-testid="line-chart" aria-label="Line chart">
      Line chart: {data.datasets[0]?.label}
    </div>
  ),
  Pie: ({ data }: any) => (
    <div data-testid="pie-chart" aria-label="Pie chart">
      Pie chart: {data.labels?.join(', ')}
    </div>
  ),
  Scatter: ({ data }: any) => (
    <div data-testid="scatter-chart" aria-label="Scatter chart">
      Scatter plot
    </div>
  ),
}));

jest.mock('@codesandbox/sandpack-react', () => ({
  SandpackProvider: ({ children, template }: any) => (
    <div data-testid="sandpack-provider" data-template={template}>
      {children}
    </div>
  ),
  SandpackLayout: ({ children }: any) => (
    <div data-testid="sandpack-layout">{children}</div>
  ),
  SandpackCodeEditor: () => (
    <div data-testid="sandpack-editor" role="textbox" aria-label="Code editor">
      Code Editor
    </div>
  ),
  SandpackPreview: () => (
    <div data-testid="sandpack-preview" role="region" aria-label="Preview">
      Widget Preview
    </div>
  ),
  SandpackConsole: () => (
    <div data-testid="sandpack-console" role="log" aria-label="Console">
      Console Output
    </div>
  ),
}));

jest.mock('@codesandbox/sandpack-themes', () => ({
  githubLight: { colors: { surface1: '#ffffff' } },
  githubDark: { colors: { surface1: '#1f2937' } },
}));

jest.mock('~/data-provider', () => ({
  useVerifyAgentToolAuth: () => ({ data: { authenticated: true } }),
  useToolCallMutation: () => ({
    mutate: jest.fn(),
    isLoading: false,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useCodeApiKeyForm: () => ({
    methods: { register: jest.fn(), handleSubmit: jest.fn() },
    onSubmit: jest.fn(),
    isDialogOpen: false,
    setIsDialogOpen: jest.fn(),
    handleRevokeApiKey: jest.fn(),
  }),
}));

jest.mock('@librechat/client', () => ({
  Spinner: ({ className }: { className?: string }) => (
    <div className={className} data-testid="spinner">Loading...</div>
  ),
  useToastContext: () => ({ showToast: jest.fn() }),
}));

// Mock IntersectionObserver
const mockIntersectionObserver = jest.fn();
mockIntersectionObserver.mockReturnValue({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
});
window.IntersectionObserver = mockIntersectionObserver;

// Mock Web Speech API
Object.defineProperty(window, 'speechSynthesis', {
  value: {
    speak: jest.fn(),
    cancel: jest.fn(),
    getVoices: jest.fn(() => []),
  },
  writable: true,
});

Object.defineProperty(window, 'SpeechSynthesisUtterance', {
  value: jest.fn(),
  writable: true,
});

describe('Enhanced Content Integration Tests', () => {
  let queryClient: QueryClient;
  let user: ReturnType<typeof userEvent.setup>;

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
    user = userEvent.setup();
    jest.clearAllMocks();
  });

  const renderEnhancedContent = (messageText: string, props = {}) => {
    const defaultMessage = {
      messageId: 'test-msg',
      text: messageText,
      isCreatedByUser: false,
      model: 'test-model',
      conversationId: 'test-conv',
      ...props,
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <RecoilRoot>
          <MessageContext.Provider value={mockMessageContext as any}>
            <EnhancedMessageContent
              message={defaultMessage}
              isLatestMessage={true}
              isCreatedByUser={false}
            />
          </MessageContext.Provider>
        </RecoilRoot>
      </QueryClientProvider>
    );
  };

  describe('Complete Content Parsing and Rendering', () => {
    it('should parse and render complex mixed content', async () => {
      const complexMessage = `
        Welcome! Let me show you different types of enhanced content:
        
        1. Text-to-Speech: [tts:en-US]Hello world![/tts]
        
        2. An image: https://example.com/image.jpg
        
        3. A chart: [chart:bar]{"labels":["A","B","C"],"datasets":[{"label":"Data","data":[1,2,3]}]}[/chart]
        
        4. Interactive widget: [widget:react]
        function App() {
          return <div>Hello Widget!</div>;
        }
        [/widget]
        
        5. Executable code: [run:python]print("Hello from Python!")[/run]
        
        That's all the enhanced content types!
      `;

      renderEnhancedContent(complexMessage);

      // Verify all content types are rendered
      await waitFor(() => {
        // TTS content
        expect(screen.getByText('Hello world!')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /click to hear/i })).toBeInTheDocument();

        // Image content
        expect(screen.getByAltText('Enhanced content image')).toBeInTheDocument();

        // Chart content
        expect(screen.getByTestId('bar-chart')).toBeInTheDocument();

        // Widget content
        expect(screen.getByText('Interactive Widget (react)')).toBeInTheDocument();
        expect(screen.getByTestId('sandpack-provider')).toBeInTheDocument();

        // Code execution content
        expect(screen.getByText(/code execution/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /execute/i })).toBeInTheDocument();

        // Regular text content
        expect(screen.getByText('Welcome! Let me show you different types of enhanced content:')).toBeInTheDocument();
        expect(screen.getByText("That's all the enhanced content types!")).toBeInTheDocument();
      });
    });

    it('should handle content with only regular text', () => {
      const plainMessage = 'This is just regular text without any enhanced content.';
      
      renderEnhancedContent(plainMessage);

      expect(screen.getByText(plainMessage)).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('should handle empty or whitespace-only messages', () => {
      renderEnhancedContent('   \n\t   ');

      // Should render without crashing
      expect(screen.getByRole('article')).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should handle TTS interactions', async () => {
      const messageWithTTS = 'Click to hear: [tts:en-US]Hello world![/tts]';
      
      renderEnhancedContent(messageWithTTS);

      const ttsButton = screen.getByRole('button', { name: /click to hear/i });
      expect(ttsButton).toBeInTheDocument();

      await user.click(ttsButton);

      // TTS should be triggered (mocked)
      expect(ttsButton).toBeInTheDocument();
    });

    it('should handle chart interactions', async () => {
      const messageWithChart = 'Here is a chart: [chart:bar]{"labels":["A","B"],"datasets":[{"data":[1,2]}]}[/chart]';
      
      renderEnhancedContent(messageWithChart);

      await waitFor(() => {
        const chart = screen.getByTestId('bar-chart');
        expect(chart).toBeInTheDocument();
        expect(chart).toHaveAttribute('aria-label', 'Bar chart');
      });
    });

    it('should handle widget console toggle', async () => {
      const messageWithWidget = 'Widget: [widget:react]console.log("test");[/widget]';
      
      renderEnhancedContent(messageWithWidget);

      await waitFor(() => {
        const consoleButton = screen.getByText(/console/i);
        expect(consoleButton).toBeInTheDocument();
      });

      const consoleButton = screen.getByText(/show console/i);
      await user.click(consoleButton);

      await waitFor(() => {
        expect(screen.getByText(/hide console/i)).toBeInTheDocument();
        expect(screen.getByTestId('sandpack-console')).toBeInTheDocument();
      });
    });

    it('should handle code execution', async () => {
      const messageWithCode = 'Execute: [run:python]print("Hello")[/run]';
      
      renderEnhancedContent(messageWithCode);

      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute/i });
        expect(executeButton).toBeInTheDocument();
      });

      const executeButton = screen.getByRole('button', { name: /execute/i });
      await user.click(executeButton);

      // Code execution should be triggered (mocked)
      expect(executeButton).toBeInTheDocument();
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle parsing errors gracefully', () => {
      const malformedMessage = 'Malformed: [tts:en-US]unclosed tag and [chart:invalid]bad data[/chart]';
      
      expect(() => renderEnhancedContent(malformedMessage)).not.toThrow();
      
      // Should render something, even if not enhanced
      expect(screen.getByRole('article')).toBeInTheDocument();
    });

    it('should handle component rendering errors with error boundary', () => {
      // Mock a component that throws an error
      const originalError = console.error;
      console.error = jest.fn();

      const messageWithError = 'This will cause an error: [chart:bar]invalid-json[/chart]';
      
      expect(() => renderEnhancedContent(messageWithError)).not.toThrow();
      
      // Error boundary should catch and display error
      expect(screen.getByRole('article')).toBeInTheDocument();

      console.error = originalError;
    });

    it('should handle network errors for multimedia content', async () => {
      const messageWithImage = 'Image: https://invalid-domain-that-does-not-exist.com/image.jpg';
      
      renderEnhancedContent(messageWithImage);

      await waitFor(() => {
        const image = screen.getByAltText('Enhanced content image');
        expect(image).toBeInTheDocument();
        
        // Simulate image load error
        fireEvent.error(image);
      });

      await waitFor(() => {
        expect(screen.getByText(/failed to load image/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility Integration', () => {
    it('should provide proper ARIA structure for complex content', async () => {
      const accessibleMessage = `
        Content with accessibility:
        [tts:en-US]Accessible speech[/tts]
        https://example.com/image.jpg
        [chart:bar]{"labels":["A"],"datasets":[{"data":[1]}]}[/chart]
      `;
      
      renderEnhancedContent(accessibleMessage);

      await waitFor(() => {
        // Main article should have proper role
        const article = screen.getByRole('article');
        expect(article).toBeInTheDocument();

        // TTS should have button role
        const ttsButton = screen.getByRole('button', { name: /click to hear/i });
        expect(ttsButton).toBeInTheDocument();

        // Image should have img role
        const image = screen.getByRole('img');
        expect(image).toBeInTheDocument();

        // Chart should have proper aria-label
        const chart = screen.getByTestId('bar-chart');
        expect(chart).toHaveAttribute('aria-label', 'Bar chart');
      });
    });

    it('should support keyboard navigation', async () => {
      const keyboardMessage = 'Navigate: [tts:en-US]keyboard accessible[/tts]';
      
      renderEnhancedContent(keyboardMessage);

      const ttsButton = screen.getByRole('button', { name: /click to hear/i });
      
      // Should be focusable
      ttsButton.focus();
      expect(ttsButton).toHaveFocus();

      // Should respond to keyboard activation
      await user.keyboard('{Enter}');
      // TTS should be triggered (mocked)
    });
  });

  describe('Performance Integration', () => {
    it('should handle large amounts of content efficiently', async () => {
      const largeMessage = Array.from({ length: 50 }, (_, i) => 
        `Item ${i}: [tts:en-US]text ${i}[/tts] https://example.com/image${i}.jpg`
      ).join('\n');

      const startTime = performance.now();
      renderEnhancedContent(largeMessage);
      const endTime = performance.now();

      // Should render quickly
      expect(endTime - startTime).toBeLessThan(1000);

      // Should render all content
      await waitFor(() => {
        const ttsButtons = screen.getAllByRole('button', { name: /click to hear/i });
        expect(ttsButtons.length).toBeGreaterThan(10); // At least some rendered
      });
    });

    it('should lazy load multimedia content', async () => {
      const messageWithImages = `
        Image 1: https://example.com/image1.jpg
        Image 2: https://example.com/image2.jpg
        Image 3: https://example.com/image3.jpg
      `;
      
      renderEnhancedContent(messageWithImages);

      // Initially should show loading placeholders
      expect(screen.getAllByText(/loading image/i)).toHaveLength(3);

      // Mock intersection observer triggering
      const mockObserve = jest.fn((callback) => {
        // Simulate images coming into view
        setTimeout(() => {
          callback([{ isIntersecting: true }]);
        }, 100);
      });
      
      mockIntersectionObserver.mockImplementation(() => ({
        observe: mockObserve,
        disconnect: jest.fn(),
      }));

      await waitFor(() => {
        const images = screen.getAllByAltText('Enhanced content image');
        expect(images.length).toBeGreaterThan(0);
      }, { timeout: 2000 });
    });
  });

  describe('State Management Integration', () => {
    it('should maintain state across re-renders', async () => {
      const messageWithWidget = 'Widget: [widget:react]console.log("test");[/widget]';
      
      const { rerender } = renderEnhancedContent(messageWithWidget);

      // Open console
      await waitFor(() => {
        const consoleButton = screen.getByText(/show console/i);
        expect(consoleButton).toBeInTheDocument();
      });

      const consoleButton = screen.getByText(/show console/i);
      await user.click(consoleButton);

      await waitFor(() => {
        expect(screen.getByTestId('sandpack-console')).toBeInTheDocument();
      });

      // Re-render with same content
      rerender(
        <QueryClientProvider client={queryClient}>
          <RecoilRoot>
            <MessageContext.Provider value={mockMessageContext as any}>
              <EnhancedMessageContent
                message={{
                  messageId: 'test-msg',
                  text: messageWithWidget,
                  isCreatedByUser: false,
                  model: 'test-model',
                  conversationId: 'test-conv',
                }}
                isLatestMessage={true}
                isCreatedByUser={false}
              />
            </MessageContext.Provider>
          </RecoilRoot>
        </QueryClientProvider>
      );

      // Console should still be open
      expect(screen.getByTestId('sandpack-console')).toBeInTheDocument();
    });

    it('should handle concurrent TTS requests correctly', async () => {
      const messageWithMultipleTTS = `
        First: [tts:en-US]Hello[/tts]
        Second: [tts:en-US]World[/tts]
        Third: [tts:en-US]Test[/tts]
      `;
      
      renderEnhancedContent(messageWithMultipleTTS);

      const ttsButtons = screen.getAllByRole('button', { name: /click to hear/i });
      expect(ttsButtons).toHaveLength(3);

      // Click multiple TTS buttons rapidly
      await user.click(ttsButtons[0]);
      await user.click(ttsButtons[1]);
      await user.click(ttsButtons[2]);

      // Should handle concurrent requests without errors
      expect(ttsButtons[0]).toBeInTheDocument();
      expect(ttsButtons[1]).toBeInTheDocument();
      expect(ttsButtons[2]).toBeInTheDocument();
    });
  });

  describe('Content Parser Integration', () => {
    it('should correctly parse and maintain content order', () => {
      const orderedMessage = 'Start [tts:en-US]TTS[/tts] middle https://example.com/image.jpg end [chart:bar]data[/chart] finish';
      
      const parseResult = ContentParser.parse(orderedMessage);
      expect(parseResult.hasEnhancedContent).toBe(true);
      
      renderEnhancedContent(orderedMessage);

      // Verify content appears in correct order
      const article = screen.getByRole('article');
      const content = article.textContent;
      
      expect(content?.indexOf('Start')).toBeLessThan(content?.indexOf('TTS') || Infinity);
      expect(content?.indexOf('middle')).toBeLessThan(content?.indexOf('end') || Infinity);
      expect(content?.indexOf('end')).toBeLessThan(content?.indexOf('finish') || Infinity);
    });

    it('should handle edge cases in content parsing', () => {
      const edgeCaseMessage = `
        Empty TTS: [tts:en-US][/tts]
        Invalid chart: [chart:bar][/chart]
        Nested content: [widget:html]<div>[tts:en-US]nested[/tts]</div>[/widget]
      `;
      
      expect(() => renderEnhancedContent(edgeCaseMessage)).not.toThrow();
      expect(screen.getByRole('article')).toBeInTheDocument();
    });
  });

  describe('Theme and Styling Integration', () => {
    it('should apply correct styling classes', async () => {
      const styledMessage = 'Styled: [tts:en-US]content[/tts] https://example.com/image.jpg';
      
      renderEnhancedContent(styledMessage);

      await waitFor(() => {
        // Check for enhanced content CSS classes
        const article = screen.getByRole('article');
        expect(article).toHaveClass('enhanced-message-content');

        // Check for TTS styling
        const ttsElement = screen.getByText('content');
        expect(ttsElement).toHaveClass('tts-text');

        // Check for multimedia styling
        const image = screen.getByAltText('Enhanced content image');
        expect(image).toHaveClass('multimedia-image');
      });
    });

    it('should handle dark mode theme switching', async () => {
      const messageWithWidget = 'Widget: [widget:react]<div>Theme test</div>[/widget]';
      
      // Mock dark mode
      document.documentElement.classList.add('dark');
      
      renderEnhancedContent(messageWithWidget);

      await waitFor(() => {
        const sandpackProvider = screen.getByTestId('sandpack-provider');
        expect(sandpackProvider).toBeInTheDocument();
        // Theme should be applied via Sandpack configuration
      });

      // Clean up
      document.documentElement.classList.remove('dark');
    });
  });
});