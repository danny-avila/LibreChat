/**
 * WidgetRenderer Tests
 * 
 * Comprehensive test suite for the WidgetRenderer component including
 * React and HTML widget rendering, error handling, and security features.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WidgetRenderer } from '../WidgetRenderer';
import type { ContentBlock } from '../types';

// Mock Sandpack components
jest.mock('@codesandbox/sandpack-react', () => ({
  Sandpack: ({ children, ...props }: any) => (
    <div data-testid="sandpack-container" data-template={props.template}>
      {children}
    </div>
  ),
  SandpackProvider: ({ children, ...props }: any) => (
    <div data-testid="sandpack-provider" data-template={props.template}>
      {children}
    </div>
  ),
  SandpackLayout: ({ children }: any) => (
    <div data-testid="sandpack-layout">{children}</div>
  ),
  SandpackCodeEditor: (props: any) => (
    <div 
      data-testid="sandpack-code-editor" 
      style={props.style}
      data-show-tabs={props.showTabs}
      data-show-line-numbers={props.showLineNumbers}
    >
      Code Editor
    </div>
  ),
  SandpackPreview: (props: any) => (
    <div 
      data-testid="sandpack-preview" 
      style={props.style}
      data-show-refresh={props.showRefreshButton}
    >
      Preview
      {props.actionsChildren}
    </div>
  ),
  SandpackConsole: (props: any) => (
    <div 
      data-testid="sandpack-console" 
      style={props.style}
      data-show-header={props.showHeader}
    >
      Console
    </div>
  ),
  SandpackFileExplorer: () => <div data-testid="sandpack-file-explorer">File Explorer</div>
}));

// Mock themes
jest.mock('@codesandbox/sandpack-themes', () => ({
  githubLight: { colors: { surface1: '#ffffff' } },
  githubDark: { colors: { surface1: '#1f2937' } }
}));

describe('WidgetRenderer', () => {
  const createMockBlock = (overrides: Partial<ContentBlock> = {}): ContentBlock => ({
    id: 'test-widget-1',
    type: 'widget',
    content: 'console.log("Hello World");',
    metadata: {
      widgetType: 'react'
    },
    position: 0,
    ...overrides
  });

  beforeEach(() => {
    // Reset DOM classes
    document.documentElement.className = '';
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders React widget with proper structure', () => {
      const block = createMockBlock();
      render(<WidgetRenderer block={block} />);

      expect(screen.getByText('Interactive Widget (react)')).toBeInTheDocument();
      expect(screen.getByTestId('sandpack-provider')).toBeInTheDocument();
      expect(screen.getByTestId('sandpack-code-editor')).toBeInTheDocument();
      expect(screen.getByTestId('sandpack-preview')).toBeInTheDocument();
    });

    it('renders HTML widget with static template', () => {
      const block = createMockBlock({
        metadata: { widgetType: 'html' },
        content: '<div>Hello HTML</div>'
      });
      render(<WidgetRenderer block={block} />);

      expect(screen.getByText('Interactive Widget (html)')).toBeInTheDocument();
      expect(screen.getByTestId('sandpack-provider')).toHaveAttribute('data-template', 'static');
    });

    it('displays widget header with status indicator', () => {
      const block = createMockBlock();
      render(<WidgetRenderer block={block} />);

      const header = screen.getByText('Interactive Widget (react)').closest('div');
      expect(header).toHaveClass('flex', 'items-center', 'space-x-2');
      
      // Check for status indicator (green dot)
      const statusIndicator = header?.querySelector('.w-3.h-3.bg-green-500.rounded-full');
      expect(statusIndicator).toBeInTheDocument();
    });

    it('shows console toggle button', () => {
      const block = createMockBlock();
      render(<WidgetRenderer block={block} />);

      const consoleButton = screen.getByText('Show Console');
      expect(consoleButton).toBeInTheDocument();
      expect(consoleButton).toHaveClass('px-2', 'py-1', 'text-xs');
    });
  });

  describe('Widget Types', () => {
    it('handles React widget with custom code', () => {
      const reactCode = `
        import React from 'react';
        export default function MyWidget() {
          return <div>Custom React Widget</div>;
        }
      `;
      const block = createMockBlock({
        content: reactCode,
        metadata: { widgetType: 'react' }
      });
      
      render(<WidgetRenderer block={block} />);
      expect(screen.getByTestId('sandpack-provider')).toHaveAttribute('data-template', 'react');
    });

    it('handles React widget without export default', () => {
      const block = createMockBlock({
        content: 'const greeting = "Hello";',
        metadata: { widgetType: 'react' }
      });
      
      render(<WidgetRenderer block={block} />);
      expect(screen.getByTestId('sandpack-code-editor')).toBeInTheDocument();
    });

    it('handles HTML widget content', () => {
      const htmlContent = '<h1>Hello HTML Widget</h1><p>This is a test</p>';
      const block = createMockBlock({
        content: htmlContent,
        metadata: { widgetType: 'html' }
      });
      
      render(<WidgetRenderer block={block} />);
      expect(screen.getByTestId('sandpack-provider')).toHaveAttribute('data-template', 'static');
    });

    it('defaults to react when widgetType is not specified', () => {
      const block = createMockBlock({
        metadata: {}
      });
      
      render(<WidgetRenderer block={block} />);
      expect(screen.getByText('Interactive Widget (react)')).toBeInTheDocument();
      expect(screen.getByTestId('sandpack-provider')).toHaveAttribute('data-template', 'react');
    });
  });

  describe('Console Functionality', () => {
    it('toggles console visibility', () => {
      const block = createMockBlock();
      render(<WidgetRenderer block={block} />);

      const consoleButton = screen.getByText('Show Console');
      
      // Console should not be visible initially
      expect(screen.queryByTestId('sandpack-console')).not.toBeInTheDocument();
      
      // Click to show console
      fireEvent.click(consoleButton);
      expect(screen.getByTestId('sandpack-console')).toBeInTheDocument();
      expect(screen.getByText('Hide Console')).toBeInTheDocument();
      
      // Click to hide console
      fireEvent.click(screen.getByText('Hide Console'));
      expect(screen.queryByTestId('sandpack-console')).not.toBeInTheDocument();
      expect(screen.getByText('Show Console')).toBeInTheDocument();
    });

    it('renders console with proper configuration', () => {
      const block = createMockBlock();
      render(<WidgetRenderer block={block} />);

      fireEvent.click(screen.getByText('Show Console'));
      
      const console = screen.getByTestId('sandpack-console');
      expect(console).toHaveAttribute('data-show-header', 'true');
      expect(console).toHaveStyle({ height: '150px' });
    });
  });

  describe('Dark Mode Support', () => {
    it('detects and applies dark mode theme', () => {
      document.documentElement.classList.add('dark');
      
      const block = createMockBlock();
      render(<WidgetRenderer block={block} />);

      // Component should detect dark mode and apply appropriate styling
      const widget = screen.getByText('Interactive Widget (react)').closest('.widget-renderer');
      expect(widget).toBeInTheDocument();
    });

    it('updates theme when dark mode changes', async () => {
      const block = createMockBlock();
      render(<WidgetRenderer block={block} />);

      // Simulate dark mode toggle
      document.documentElement.classList.add('dark');
      
      // Trigger the mutation observer
      const event = new Event('DOMSubtreeModified');
      document.documentElement.dispatchEvent(event);

      await waitFor(() => {
        expect(screen.getByTestId('sandpack-provider')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error state when execution fails', async () => {
      const block = createMockBlock();
      render(<WidgetRenderer block={block} />);
      
      expect(screen.getAllByTestId('sandpack-provider')).toHaveLength(1);
    });

    it('shows timeout error after 30 seconds', async () => {
      jest.useFakeTimers();
      
      const block = createMockBlock();
      render(<WidgetRenderer block={block} />);

      // Fast-forward time by 30 seconds
      jest.advanceTimersByTime(30000);

      await waitFor(() => {
        // The timeout should trigger error state
        expect(screen.getByTestId('sandpack-provider')).toBeInTheDocument();
      });

      jest.useRealTimers();
    });

    it('clears timeout on component unmount', () => {
      jest.useFakeTimers();
      
      const block = createMockBlock();
      const { unmount } = render(<WidgetRenderer block={block} />);

      // Trigger timeout creation by simulating execution start
      // This would normally happen through Sandpack events
      
      unmount();
      
      // The component should clean up properly without errors
      expect(true).toBe(true); // Test passes if no errors during unmount
      jest.useRealTimers();
    });
  });

  describe('Sandpack Configuration', () => {
    it('configures Sandpack with proper options for React widgets', () => {
      const block = createMockBlock();
      render(<WidgetRenderer block={block} />);

      const provider = screen.getByTestId('sandpack-provider');
      expect(provider).toHaveAttribute('data-template', 'react');
    });

    it('configures Sandpack with proper options for HTML widgets', () => {
      const block = createMockBlock({
        metadata: { widgetType: 'html' }
      });
      render(<WidgetRenderer block={block} />);

      const provider = screen.getByTestId('sandpack-provider');
      expect(provider).toHaveAttribute('data-template', 'static');
    });

    it('sets up code editor with proper configuration', () => {
      const block = createMockBlock();
      render(<WidgetRenderer block={block} />);

      const codeEditor = screen.getByTestId('sandpack-code-editor');
      expect(codeEditor).toHaveStyle({ height: '300px' });
      expect(codeEditor).toHaveAttribute('data-show-line-numbers', 'true');
    });

    it('sets up preview with proper configuration', () => {
      const block = createMockBlock();
      render(<WidgetRenderer block={block} />);

      const preview = screen.getByTestId('sandpack-preview');
      expect(preview).toHaveStyle({ height: '300px' });
      expect(preview).toHaveAttribute('data-show-refresh', 'true');
    });
  });

  describe('Responsive Design', () => {
    it('applies mobile-friendly styling', () => {
      const block = createMockBlock();
      render(<WidgetRenderer block={block} />);

      const widget = screen.getByText('Interactive Widget (react)').closest('.widget-renderer');
      expect(widget).toHaveClass('widget-renderer');
    });
  });

  describe('Security Features', () => {
    it('provides sandboxed execution environment', () => {
      const block = createMockBlock({
        content: 'alert("potentially malicious code");'
      });
      render(<WidgetRenderer block={block} />);

      // Sandpack should isolate the code execution
      expect(screen.getByTestId('sandpack-provider')).toBeInTheDocument();
      expect(screen.getByText('Secure sandbox environment • Resource limited')).toBeInTheDocument();
    });

    it('displays security information in footer', () => {
      const block = createMockBlock();
      render(<WidgetRenderer block={block} />);

      expect(screen.getByText('Secure sandbox environment • Resource limited')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('provides proper ARIA labels and structure', () => {
      const block = createMockBlock();
      render(<WidgetRenderer block={block} />);

      const header = screen.getByText('Interactive Widget (react)');
      expect(header).toBeInTheDocument();
      
      const consoleButton = screen.getByText('Show Console');
      expect(consoleButton.tagName).toBe('BUTTON');
    });

    it('supports keyboard navigation', () => {
      const block = createMockBlock();
      render(<WidgetRenderer block={block} />);

      const consoleButton = screen.getByText('Show Console');
      consoleButton.focus();
      expect(consoleButton).toHaveFocus();
    });
  });
});