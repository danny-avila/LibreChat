import React from 'react';
import { Tools } from 'librechat-data-provider';
import { UIResourceRenderer } from '@mcp-ui/client';
import { render, screen } from '@testing-library/react';
import type { TAttachment } from 'librechat-data-provider';
import UIResourceCarousel from '~/components/Chat/Messages/Content/UIResourceCarousel';
import ToolCallInfo from '~/components/Chat/Messages/Content/ToolCallInfo';

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

  describe('ui_resources from attachments', () => {
    it('should render single ui_resource from attachments', () => {
      const uiResource = {
        type: 'text',
        data: 'Test resource',
      };

      const attachments: TAttachment[] = [
        {
          type: Tools.ui_resources,
          messageId: 'msg123',
          toolCallId: 'tool456',
          conversationId: 'conv789',
          [Tools.ui_resources]: [uiResource],
        },
      ];

      // Need output for ui_resources to render
      render(<ToolCallInfo {...mockProps} output="Some output" attachments={attachments} />);

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

    it('should render carousel for multiple ui_resources from attachments', () => {
      // To test multiple resources, we can use a single attachment with multiple resources
      const attachments: TAttachment[] = [
        {
          type: Tools.ui_resources,
          messageId: 'msg1',
          toolCallId: 'tool1',
          conversationId: 'conv1',
          [Tools.ui_resources]: [
            { type: 'text', data: 'Resource 1' },
            { type: 'text', data: 'Resource 2' },
            { type: 'text', data: 'Resource 3' },
          ],
        },
      ];

      // Need output for ui_resources to render
      render(<ToolCallInfo {...mockProps} output="Some output" attachments={attachments} />);

      // Should render carousel for multiple resources
      expect(UIResourceCarousel).toHaveBeenCalledWith(
        expect.objectContaining({
          uiResources: [
            { type: 'text', data: 'Resource 1' },
            { type: 'text', data: 'Resource 2' },
            { type: 'text', data: 'Resource 3' },
          ],
        }),
        expect.any(Object),
      );

      // Should not render individual UIResourceRenderer
      expect(UIResourceRenderer).not.toHaveBeenCalled();
    });

    it('should handle attachments with normal output', () => {
      const attachments: TAttachment[] = [
        {
          type: Tools.ui_resources,
          messageId: 'msg123',
          toolCallId: 'tool456',
          conversationId: 'conv789',
          [Tools.ui_resources]: [{ type: 'text', data: 'UI Resource' }],
        },
      ];

      const output = JSON.stringify([
        { type: 'text', text: 'Regular output 1' },
        { type: 'text', text: 'Regular output 2' },
      ]);

      const { container } = render(
        <ToolCallInfo {...mockProps} output={output} attachments={attachments} />,
      );

      // Check that the output is displayed normally
      const codeBlocks = container.querySelectorAll('code');
      const outputCode = codeBlocks[1]?.textContent; // Second code block is the output

      expect(outputCode).toContain('Regular output 1');
      expect(outputCode).toContain('Regular output 2');

      // UI resources should be rendered via attachments
      expect(UIResourceRenderer).toHaveBeenCalled();
    });

    it('should handle no attachments', () => {
      const output = JSON.stringify([{ type: 'text', text: 'Regular output' }]);

      render(<ToolCallInfo {...mockProps} output={output} />);

      expect(UIResourceRenderer).not.toHaveBeenCalled();
      expect(UIResourceCarousel).not.toHaveBeenCalled();
    });

    it('should handle empty attachments array', () => {
      const attachments: TAttachment[] = [];

      render(<ToolCallInfo {...mockProps} attachments={attachments} />);

      expect(UIResourceRenderer).not.toHaveBeenCalled();
      expect(UIResourceCarousel).not.toHaveBeenCalled();
    });

    it('should handle attachments with non-ui_resources type', () => {
      const attachments: TAttachment[] = [
        {
          type: Tools.web_search as any,
          messageId: 'msg123',
          toolCallId: 'tool456',
          conversationId: 'conv789',
          [Tools.web_search]: {
            organic: [],
          },
        },
      ];

      render(<ToolCallInfo {...mockProps} attachments={attachments} />);

      // Should not render UI resources components for non-ui_resources attachments
      expect(UIResourceRenderer).not.toHaveBeenCalled();
      expect(UIResourceCarousel).not.toHaveBeenCalled();
    });
  });

  describe('rendering logic', () => {
    it('should render UI Resources heading when ui_resources exist in attachments', () => {
      const attachments: TAttachment[] = [
        {
          type: Tools.ui_resources,
          messageId: 'msg123',
          toolCallId: 'tool456',
          conversationId: 'conv789',
          [Tools.ui_resources]: [{ type: 'text', data: 'Test' }],
        },
      ];

      // Need output for ui_resources section to render
      render(<ToolCallInfo {...mockProps} output="Some output" attachments={attachments} />);

      expect(screen.getByText('UI Resources')).toBeInTheDocument();
    });

    it('should not render UI Resources heading when no ui_resources in attachments', () => {
      render(<ToolCallInfo {...mockProps} />);

      expect(screen.queryByText('UI Resources')).not.toBeInTheDocument();
    });

    it('should pass correct props to UIResourceRenderer', () => {
      const uiResource = {
        type: 'form',
        data: { fields: [{ name: 'test', type: 'text' }] },
      };

      const attachments: TAttachment[] = [
        {
          type: Tools.ui_resources,
          messageId: 'msg123',
          toolCallId: 'tool456',
          conversationId: 'conv789',
          [Tools.ui_resources]: [uiResource],
        },
      ];

      // Need output for ui_resources to render
      render(<ToolCallInfo {...mockProps} output="Some output" attachments={attachments} />);

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

      const attachments: TAttachment[] = [
        {
          type: Tools.ui_resources,
          messageId: 'msg123',
          toolCallId: 'tool456',
          conversationId: 'conv789',
          [Tools.ui_resources]: [{ type: 'text', data: 'Test' }],
        },
      ];

      // Need output for ui_resources to render
      render(<ToolCallInfo {...mockProps} output="Some output" attachments={attachments} />);

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

  describe('backward compatibility', () => {
    it('should handle output with ui_resources for backward compatibility', () => {
      const output = JSON.stringify([
        { type: 'text', text: 'Regular output' },
        {
          metadata: {
            type: 'ui_resources',
            data: [{ type: 'text', data: 'UI Resource' }],
          },
        },
      ]);

      render(<ToolCallInfo {...mockProps} output={output} />);

      // Since we now use attachments, ui_resources in output should be ignored
      expect(UIResourceRenderer).not.toHaveBeenCalled();
      expect(UIResourceCarousel).not.toHaveBeenCalled();
    });

    it('should prioritize attachments over output ui_resources', () => {
      const attachments: TAttachment[] = [
        {
          type: Tools.ui_resources,
          messageId: 'msg123',
          toolCallId: 'tool456',
          conversationId: 'conv789',
          [Tools.ui_resources]: [{ type: 'attachment', data: 'From attachments' }],
        },
      ];

      const output = JSON.stringify([
        {
          metadata: {
            type: 'ui_resources',
            data: [{ type: 'output', data: 'From output' }],
          },
        },
      ]);

      render(<ToolCallInfo {...mockProps} output={output} attachments={attachments} />);

      // Should use attachments, not output
      expect(UIResourceRenderer).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: { type: 'attachment', data: 'From attachments' },
        }),
        expect.any(Object),
      );
    });
  });
});
