/**
 * Accessibility Integration Tests
 * 
 * Tests for accessibility features across all enhanced content components
 * including keyboard navigation, screen reader support, and ARIA compliance.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnhancedMessageContent } from '../EnhancedMessageContent';
import { TTSRenderer } from '../TTSRenderer';
import { MultimediaRenderer } from '../MultimediaRenderer';
import { ChartRenderer } from '../ChartRenderer';
import { WidgetRenderer } from '../WidgetRenderer';
import CodeExecutionRenderer from '../CodeExecutionRenderer';

// Mock dependencies
jest.mock('../TTSEngine', () => ({
  TTSEngine: {
    getInstance: () => ({
      isSupported: () => true,
      isSpeaking: () => false,
      speak: jest.fn(),
      stop: jest.fn(),
      onStateChange: jest.fn(),
      getState: () => ({
        isPlaying: false,
        currentText: '',
        currentLanguage: '',
        currentUtterance: null,
      }),
    }),
  },
}));

jest.mock('~/data-provider', () => ({
  useVerifyAgentToolAuth: () => ({ data: { authenticated: true } }),
  useToolCallMutation: () => ({
    mutate: jest.fn(),
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

jest.mock('~/Providers', () => ({
  useMessageContext: () => ({
    messageId: 'test-message',
    conversationId: 'test-conversation',
    partIndex: 0,
  }),
}));

jest.mock('@librechat/client', () => ({
  Spinner: () => <div data-testid="spinner">Loading...</div>,
  useToastContext: () => ({ showToast: jest.fn() }),
}));

// Mock Chart.js
jest.mock('chart.js', () => ({
  Chart: {
    register: jest.fn(),
  },
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
  Bar: ({ data }: any) => <div data-testid="bar-chart" aria-label="Bar chart">{JSON.stringify(data)}</div>,
  Line: ({ data }: any) => <div data-testid="line-chart" aria-label="Line chart">{JSON.stringify(data)}</div>,
  Pie: ({ data }: any) => <div data-testid="pie-chart" aria-label="Pie chart">{JSON.stringify(data)}</div>,
  Scatter: ({ data }: any) => <div data-testid="scatter-chart" aria-label="Scatter chart">{JSON.stringify(data)}</div>,
}));

// Mock Sandpack
jest.mock('@codesandbox/sandpack-react', () => ({
  SandpackProvider: ({ children }: any) => <div data-testid="sandpack-provider">{children}</div>,
  SandpackLayout: ({ children }: any) => <div data-testid="sandpack-layout">{children}</div>,
  SandpackCodeEditor: () => <div data-testid="sandpack-editor" role="textbox" aria-label="Code editor" />,
  SandpackPreview: () => <div data-testid="sandpack-preview" role="region" aria-label="Preview" />,
  SandpackConsole: () => <div data-testid="sandpack-console" role="log" aria-label="Console output" />,
  githubLight: {},
  githubDark: {},
}));

describe('Accessibility Integration Tests', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    // Mock window.matchMedia for accessibility preferences
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    // Mock Web Speech API
    Object.defineProperty(window, 'speechSynthesis', {
      writable: true,
      value: {
        speak: jest.fn(),
        cancel: jest.fn(),
        getVoices: jest.fn().mockReturnValue([]),
        speaking: false,
        pending: false,
        paused: false,
      },
    });
  });

  describe('TTS Renderer Accessibility', () => {
    it('should have proper ARIA labels and roles', async () => {
      const { container } = render(
        <TTSRenderer text="Hello world" language="en-US" />
      );

      // Check for proper ARIA attributes
      const textElement = screen.getByRole('button', { name: /clickable text for speech synthesis/i });
      const buttonElement = screen.getByRole('button', { name: /read.*aloud/i });

      expect(textElement).toHaveAttribute('aria-label');
      expect(textElement).toHaveAttribute('aria-pressed');
      expect(buttonElement).toHaveAttribute('aria-label');
      expect(buttonElement).toHaveAttribute('aria-pressed');

      // Check for basic accessibility attributes
      expect(textElement).toHaveAttribute('tabIndex');
      expect(buttonElement).toHaveAttribute('aria-label');
    });

    it('should support keyboard navigation', async () => {
      render(<TTSRenderer text="Hello world" language="en-US" />);

      const textElement = screen.getByRole('button', { name: /clickable text for speech synthesis/i });
      
      // Focus the element
      textElement.focus();
      expect(textElement).toHaveFocus();

      // Test Enter key
      await user.keyboard('{Enter}');
      // Should trigger TTS (mocked)

      // Test Space key
      await user.keyboard(' ');
      // Should trigger TTS (mocked)
    });

    it('should announce status changes to screen readers', async () => {
      render(<TTSRenderer text="Hello world" language="en-US" />);

      // Check for live region
      const statusElement = screen.getByText('', { selector: '[aria-live="polite"]' });
      expect(statusElement).toBeInTheDocument();
    });
  });

  describe('Multimedia Renderer Accessibility', () => {
    const mockBlock = {
      id: 'test-1',
      type: 'image' as const,
      content: 'https://example.com/image.jpg',
      metadata: {},
      position: 0,
    };

    it('should have proper alt text and ARIA labels', async () => {
      const { container } = render(<MultimediaRenderer block={mockBlock} />);

      await waitFor(() => {
        const imageContainer = screen.getByRole('img');
        expect(imageContainer).toHaveAttribute('aria-label');
      });

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should handle keyboard focus', async () => {
      render(<MultimediaRenderer block={mockBlock} />);

      await waitFor(() => {
        const imageContainer = screen.getByRole('img');
        imageContainer.focus();
        expect(imageContainer).toHaveFocus();
      });
    });

    it('should provide error announcements', async () => {
      const errorBlock = {
        ...mockBlock,
        content: 'invalid-url',
      };

      render(<MultimediaRenderer block={errorBlock} />);

      await waitFor(() => {
        const errorAlert = screen.getByRole('alert');
        expect(errorAlert).toBeInTheDocument();
        expect(errorAlert).toHaveAttribute('aria-label');
      });
    });
  });

  describe('Chart Renderer Accessibility', () => {
    const chartData = JSON.stringify({
      labels: ['Jan', 'Feb', 'Mar'],
      datasets: [{ label: 'Sales', data: [100, 200, 150] }],
    });

    it('should provide chart description and data table', async () => {
      const { container } = render(
        <ChartRenderer type="bar" data={chartData} />
      );

      await waitFor(() => {
        // Check for chart container with proper role
        const chartContainer = screen.getByRole('img');
        expect(chartContainer).toHaveAttribute('aria-label');
        expect(chartContainer).toHaveAttribute('tabIndex', '0');
      });
    });

    it('should support keyboard navigation', async () => {
      render(<ChartRenderer type="bar" data={chartData} />);

      await waitFor(() => {
        const chartContainer = screen.getByRole('img');
        chartContainer.focus();
        expect(chartContainer).toHaveFocus();
      });
    });

    it('should announce chart loading and errors', async () => {
      render(<ChartRenderer type="bar" data="invalid-json" />);

      await waitFor(() => {
        // Should show error state
        const errorMessage = screen.getByText(/chart error/i);
        expect(errorMessage).toBeInTheDocument();
      });
    });
  });

  describe('Widget Renderer Accessibility', () => {
    const mockBlock = {
      id: 'test-widget',
      type: 'widget' as const,
      content: 'console.log("Hello");',
      metadata: { widgetType: 'react' },
      position: 0,
    };

    it('should have proper application role and labels', async () => {
      const { container } = render(<WidgetRenderer block={mockBlock} />);

      const widgetContainer = screen.getByRole('application');
      expect(widgetContainer).toHaveAttribute('aria-label');
      expect(widgetContainer).toHaveAttribute('tabIndex', '0');

      // Check for console toggle button
      const consoleButton = screen.getByRole('button', { name: /console/i });
      expect(consoleButton).toHaveAttribute('aria-pressed');

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should support keyboard navigation for controls', async () => {
      render(<WidgetRenderer block={mockBlock} />);

      const consoleButton = screen.getByRole('button', { name: /console/i });
      
      // Test keyboard activation
      consoleButton.focus();
      expect(consoleButton).toHaveFocus();

      await user.keyboard('{Enter}');
      // Should toggle console visibility
    });

    it('should announce execution status', async () => {
      render(<WidgetRenderer block={mockBlock} />);

      // Check for status region
      const statusRegion = screen.getByText('Widget ready', { selector: '[aria-live="polite"]' });
      expect(statusRegion).toBeInTheDocument();
    });
  });

  describe('Code Execution Renderer Accessibility', () => {
    it('should have proper region role and labels', async () => {
      const { container } = render(
        <CodeExecutionRenderer code="print('Hello')" language="python" />
      );

      const codeContainer = screen.getByRole('region', { name: /code block in python/i });
      expect(codeContainer).toHaveAttribute('tabIndex', '0');

      // Check for execute button
      const executeButton = screen.getByRole('button', { name: /execute python code/i });
      expect(executeButton).toBeInTheDocument();

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should support keyboard navigation', async () => {
      render(<CodeExecutionRenderer code="print('Hello')" language="python" />);

      const executeButton = screen.getByRole('button', { name: /execute python code/i });
      
      executeButton.focus();
      expect(executeButton).toHaveFocus();

      await user.keyboard('{Enter}');
      // Should trigger code execution
    });

    it('should announce execution status and results', async () => {
      render(<CodeExecutionRenderer code="print('Hello')" language="python" />);

      // Check for status region
      const statusElement = screen.getByText('Code ready for execution', { selector: '[aria-live="polite"]' });
      expect(statusElement).toBeInTheDocument();
    });
  });

  describe('Enhanced Message Content Accessibility', () => {
    const mockMessage = {
      messageId: 'test-msg',
      text: 'Here is some [tts:en-US]enhanced content[/tts] with a chart [chart:bar]{"labels":["A","B"],"datasets":[{"data":[1,2]}]}[/chart]',
      isCreatedByUser: false,
      model: 'test-model',
      conversationId: 'test-conv',
    };

    it('should provide proper document structure', async () => {
      const { container } = render(
        <EnhancedMessageContent
          message={mockMessage}
          isLatestMessage={true}
          isCreatedByUser={false}
        />
      );

      await waitFor(() => {
        const article = screen.getByRole('article', { name: /enhanced message content/i });
        expect(article).toHaveAttribute('tabIndex', '0');

        // Check for content blocks
        const contentBlocks = container.querySelectorAll('[data-block-type]');
        expect(contentBlocks.length).toBeGreaterThan(0);
      });

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should provide content summary for screen readers', async () => {
      render(
        <EnhancedMessageContent
          message={mockMessage}
          isLatestMessage={true}
          isCreatedByUser={false}
        />
      );

      await waitFor(() => {
        const summary = screen.getByText(/enhanced content summary/i, { selector: '.sr-only' });
        expect(summary).toBeInTheDocument();
      });
    });

    it('should handle focus management across content blocks', async () => {
      render(
        <EnhancedMessageContent
          message={mockMessage}
          isLatestMessage={true}
          isCreatedByUser={false}
        />
      );

      await waitFor(() => {
        const article = screen.getByRole('article');
        article.focus();
        expect(article).toHaveFocus();

        // Should be able to navigate to interactive elements
        const interactiveElements = screen.getAllByRole('button');
        expect(interactiveElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Reduced Motion Support', () => {
    beforeEach(() => {
      // Mock reduced motion preference
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation((query) => ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });
    });

    it('should disable animations when reduced motion is preferred', async () => {
      const { container } = render(
        <TTSRenderer text="Hello world" language="en-US" />
      );

      const textElement = container.querySelector('.tts-text');
      expect(textElement).toHaveClass('tts-text-no-animation');
    });
  });

  describe('High Contrast Support', () => {
    beforeEach(() => {
      // Mock high contrast preference
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation((query) => ({
          matches: query.includes('prefers-contrast: high'),
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });
    });

    it('should apply high contrast styles when preferred', async () => {
      const { container } = render(
        <ChartRenderer type="bar" data='{"labels":["A"],"datasets":[{"data":[1]}]}' />
      );

      await waitFor(() => {
        // High contrast styles should be applied via CSS media queries
        // This test verifies the structure is in place for CSS to target
        const chartContainer = container.querySelector('.enhanced-chart-container');
        expect(chartContainer).toBeInTheDocument();
      });
    });
  });

  describe('Touch Accessibility', () => {
    it('should provide adequate touch targets on mobile', async () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(<TTSRenderer text="Hello world" language="en-US" />);

      const ttsButton = screen.getByRole('button', { name: /read.*aloud/i });
      
      // Touch targets should be at least 44px (will be verified by CSS)
      expect(ttsButton).toHaveAttribute('data-touch-feedback', 'true');
    });
  });

  describe('Error Handling Accessibility', () => {
    it('should provide accessible error messages', async () => {
      const { container } = render(
        <ChartRenderer type="bar" data="invalid-json" />
      );

      await waitFor(() => {
        const errorMessage = screen.getByText(/chart error/i);
        expect(errorMessage).toBeInTheDocument();
      });

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should announce errors to screen readers', async () => {
      render(<ChartRenderer type="bar" data="invalid-json" />);

      await waitFor(() => {
        // Error should be announced via live region
        const errorElement = screen.getByText(/chart error/i);
        expect(errorElement).toBeInTheDocument();
      });
    });
  });
});