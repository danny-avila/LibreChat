import React from 'react';
import { render, screen } from '@testing-library/react';
import ToolCallInfo from '../ToolCallInfo';
import { UIResourceRenderer } from '@mcp-ui/client';
import UIResourceCarousel from '../UIResourceCarousel';

// Mock the dependencies
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: any) => {
    const translations: Record<string, string> = {
      com_assistants_domain_info: `Used ${values?.[0]}`,
      com_assistants_function_use: `Used ${values?.[0]}`,
      com_assistants_action_attempt: `Attempted to use ${values?.[0]}`,
      com_assistants_attempt_info: 'Attempted to use function',
      com_ui_result: 'Result',
      com_ui_ui_resources: 'UI Resources',
    };
    return translations[key] || key;
  },
}));

jest.mock('@mcp-ui/client', () => ({
  UIResourceRenderer: jest.fn(() => null),
}));

jest.mock('../UIResourceCarousel', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

// Add TextEncoder/TextDecoder polyfill for Jest environment
import { TextEncoder, TextDecoder } from 'util';

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder as any;
  global.TextDecoder = TextDecoder as any;
}

describe('ToolCallInfo', () => {
  const mockProps = {
    input: '{"test": "input"}',
    function_name: 'testFunction',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ui_resources extraction', () => {
    it('should extract single ui_resource from output', () => {
      const uiResource = {
        type: 'text',
        data: 'Test resource',
      };

      const output = JSON.stringify([
        { type: 'text', text: 'Regular output' },
        {
          metadata: {
            type: 'ui_resources',
            data: [uiResource],
          },
        },
      ]);

      render(<ToolCallInfo {...mockProps} output={output} />);

      // Should render UIResourceRenderer for single resource
      expect(UIResourceRenderer).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: uiResource,
          onUIAction: expect.any(Function),
          htmlProps: {
            autoResizeIframe: { width: true, height: true },
          },
        }),
        expect.any(Object),
      );

      // Should not render carousel for single resource
      expect(UIResourceCarousel).not.toHaveBeenCalled();
    });

    it('should extract multiple ui_resources from output', () => {
      const uiResources = [
        { type: 'text', data: 'Resource 1' },
        { type: 'text', data: 'Resource 2' },
        { type: 'text', data: 'Resource 3' },
      ];

      const output = JSON.stringify([
        { type: 'text', text: 'Regular output' },
        {
          metadata: {
            type: 'ui_resources',
            data: uiResources,
          },
        },
      ]);

      render(<ToolCallInfo {...mockProps} output={output} />);

      // Should render carousel for multiple resources
      expect(UIResourceCarousel).toHaveBeenCalledWith(
        expect.objectContaining({
          uiResources,
        }),
        expect.any(Object),
      );

      // Should not render individual UIResourceRenderer
      expect(UIResourceRenderer).not.toHaveBeenCalled();
    });

    it('should filter out ui_resources from displayed output', () => {
      const regularContent = [
        { type: 'text', text: 'Regular output 1' },
        { type: 'text', text: 'Regular output 2' },
      ];

      const output = JSON.stringify([
        ...regularContent,
        {
          metadata: {
            type: 'ui_resources',
            data: [{ type: 'text', data: 'UI Resource' }],
          },
        },
      ]);

      const { container } = render(<ToolCallInfo {...mockProps} output={output} />);

      // Check that the displayed output doesn't contain ui_resources
      const codeBlocks = container.querySelectorAll('code');
      const outputCode = codeBlocks[1]?.textContent; // Second code block is the output

      expect(outputCode).toContain('Regular output 1');
      expect(outputCode).toContain('Regular output 2');
      expect(outputCode).not.toContain('ui_resources');
    });

    it('should handle output without ui_resources', () => {
      const output = JSON.stringify([{ type: 'text', text: 'Regular output' }]);

      render(<ToolCallInfo {...mockProps} output={output} />);

      expect(UIResourceRenderer).not.toHaveBeenCalled();
      expect(UIResourceCarousel).not.toHaveBeenCalled();
    });

    it('should handle malformed ui_resources gracefully', () => {
      const output = JSON.stringify([
        {
          metadata: 'ui_resources', // metadata should be an object, not a string
          text: 'some text content',
        },
      ]);

      // Component should not throw error and should render without UI resources
      const { container } = render(<ToolCallInfo {...mockProps} output={output} />);

      // Should render the component without crashing
      expect(container).toBeTruthy();

      // UIResourceCarousel should not be called since the metadata structure is invalid
      expect(UIResourceCarousel).not.toHaveBeenCalled();
    });

    it('should handle ui_resources as plain text without breaking', () => {
      const outputWithTextOnly =
        'This output contains ui_resources as plain text but not as a proper structure';

      render(<ToolCallInfo {...mockProps} output={outputWithTextOnly} />);

      // Should render normally without errors
      expect(screen.getByText(`Used ${mockProps.function_name}`)).toBeInTheDocument();
      expect(screen.getByText('Result')).toBeInTheDocument();

      // The output text should be displayed in a code block
      const codeBlocks = screen.getAllByText((content, element) => {
        return element?.tagName === 'CODE' && content.includes(outputWithTextOnly);
      });
      expect(codeBlocks.length).toBeGreaterThan(0);

      // Should not render UI resources components
      expect(UIResourceRenderer).not.toHaveBeenCalled();
      expect(UIResourceCarousel).not.toHaveBeenCalled();
    });
  });

  describe('rendering logic', () => {
    it('should render UI Resources heading when ui_resources exist', () => {
      const output = JSON.stringify([
        {
          metadata: {
            type: 'ui_resources',
            data: [{ type: 'text', data: 'Test' }],
          },
        },
      ]);

      render(<ToolCallInfo {...mockProps} output={output} />);

      expect(screen.getByText('UI Resources')).toBeInTheDocument();
    });

    it('should not render UI Resources heading when no ui_resources', () => {
      const output = JSON.stringify([{ type: 'text', text: 'Regular output' }]);

      render(<ToolCallInfo {...mockProps} output={output} />);

      expect(screen.queryByText('UI Resources')).not.toBeInTheDocument();
    });

    it('should pass correct props to UIResourceRenderer', () => {
      const uiResource = {
        type: 'form',
        data: { fields: [{ name: 'test', type: 'text' }] },
      };

      const output = JSON.stringify([
        {
          metadata: {
            type: 'ui_resources',
            data: [uiResource],
          },
        },
      ]);

      render(<ToolCallInfo {...mockProps} output={output} />);

      expect(UIResourceRenderer).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: uiResource,
          onUIAction: expect.any(Function),
          htmlProps: {
            autoResizeIframe: { width: true, height: true },
          },
        }),
        expect.any(Object),
      );
    });

    it('should console.log when UIAction is triggered', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const output = JSON.stringify([
        {
          metadata: {
            type: 'ui_resources',
            data: [{ type: 'text', data: 'Test' }],
          },
        },
      ]);

      render(<ToolCallInfo {...mockProps} output={output} />);

      const mockUIResourceRenderer = UIResourceRenderer as jest.MockedFunction<
        typeof UIResourceRenderer
      >;
      const onUIAction = mockUIResourceRenderer.mock.calls[0]?.[0]?.onUIAction;
      const testResult = { action: 'submit', data: { test: 'value' } };

      if (onUIAction) {
        await onUIAction(testResult as any);
      }

      expect(consoleSpy).toHaveBeenCalledWith('Action:', testResult);

      consoleSpy.mockRestore();
    });
  });
});
