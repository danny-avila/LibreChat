import { ContentTypes } from 'librechat-data-provider';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { formatContentStrings } from './content';

describe('formatContentStrings', () => {
  describe('Human messages', () => {
    it('should convert human message with all text blocks to string', () => {
      const messages = [
        new HumanMessage({
          content: [
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Hello' },
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'World' },
          ],
        }),
      ];

      const result = formatContentStrings(messages);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Hello\nWorld');
    });

    it('should not convert human message with mixed content types (text + image)', () => {
      const messages = [
        new HumanMessage({
          content: [
            { type: ContentTypes.TEXT, text: 'what do you see' },
            {
              type: 'image_url',
              image_url: {
                url: 'data:image/png;base64,iVBO_SOME_BASE64_DATA=',
                detail: 'auto',
              },
            },
          ],
        }),
      ];

      const result = formatContentStrings(messages);

      expect(result).toHaveLength(1);
      expect(result[0].content).toEqual([
        { type: ContentTypes.TEXT, text: 'what do you see' },
        {
          type: 'image_url',
          image_url: {
            url: 'data:image/png;base64,iVBO_SOME_BASE64_DATA=',
            detail: 'auto',
          },
        },
      ]);
    });

    it('should leave string content unchanged', () => {
      const messages = [
        new HumanMessage({
          content: 'Hello World',
        }),
      ];

      const result = formatContentStrings(messages);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Hello World');
    });

    it('should handle empty text blocks', () => {
      const messages = [
        new HumanMessage({
          content: [
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Hello' },
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: '' },
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'World' },
          ],
        }),
      ];

      const result = formatContentStrings(messages);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Hello\n\nWorld');
    });

    it('should handle null/undefined text values', () => {
      const messages = [
        new HumanMessage({
          content: [
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Hello' },
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: null },
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: undefined },
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'World' },
          ],
        }),
      ];

      const result = formatContentStrings(messages);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Hello\n\n\nWorld');
    });
  });

  describe('AI messages', () => {
    it('should convert AI message with all text blocks to string', () => {
      const messages = [
        new AIMessage({
          content: [
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Hello' },
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'World' },
          ],
        }),
      ];

      const result = formatContentStrings(messages);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Hello\nWorld');
      expect(result[0].getType()).toBe('ai');
    });

    it('should not convert AI message with mixed content types', () => {
      const messages = [
        new AIMessage({
          content: [
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Here is an image' },
            { type: ContentTypes.TOOL_CALL, tool_call: { name: 'generate_image' } },
          ],
        }),
      ];

      const result = formatContentStrings(messages);

      expect(result).toHaveLength(1);
      expect(result[0].content).toEqual([
        { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Here is an image' },
        { type: ContentTypes.TOOL_CALL, tool_call: { name: 'generate_image' } },
      ]);
    });
  });

  describe('System messages', () => {
    it('should convert System message with all text blocks to string', () => {
      const messages = [
        new SystemMessage({
          content: [
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'System' },
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Message' },
          ],
        }),
      ];

      const result = formatContentStrings(messages);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('System\nMessage');
      expect(result[0].getType()).toBe('system');
    });
  });

  describe('Mixed message types', () => {
    it('should process all valid message types in mixed array', () => {
      const messages = [
        new HumanMessage({
          content: [
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Human' },
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Message' },
          ],
        }),
        new AIMessage({
          content: [
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'AI' },
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Response' },
          ],
        }),
        new SystemMessage({
          content: [
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'System' },
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Prompt' },
          ],
        }),
      ];

      const result = formatContentStrings(messages);

      expect(result).toHaveLength(3);
      // All messages should be converted
      expect(result[0].content).toBe('Human\nMessage');
      expect(result[0].getType()).toBe('human');

      expect(result[1].content).toBe('AI\nResponse');
      expect(result[1].getType()).toBe('ai');

      expect(result[2].content).toBe('System\nPrompt');
      expect(result[2].getType()).toBe('system');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty array', () => {
      const result = formatContentStrings([]);
      expect(result).toEqual([]);
    });

    it('should handle messages with non-array content', () => {
      const messages = [
        new HumanMessage({
          content: 'This is a string content',
        }),
      ];

      const result = formatContentStrings(messages);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('This is a string content');
    });

    it('should trim the final concatenated string', () => {
      const messages = [
        new HumanMessage({
          content: [
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: '  Hello  ' },
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: '  World  ' },
          ],
        }),
      ];

      const result = formatContentStrings(messages);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Hello  \n  World');
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle the exact scenario from the issue', () => {
      const messages = [
        new HumanMessage({
          content: [
            {
              type: 'text',
              text: 'hi there',
            },
          ],
        }),
        new AIMessage({
          content: [
            {
              type: 'text',
              text: 'Hi Danny! How can I help you today?',
            },
          ],
        }),
        new HumanMessage({
          content: [
            {
              type: 'text',
              text: 'what do you see',
            },
            {
              type: 'image_url',
              image_url: {
                url: 'data:image/png;base64,iVBO_SOME_BASE64_DATA=',
                detail: 'auto',
              },
            },
          ],
        }),
      ];

      const result = formatContentStrings(messages);

      expect(result).toHaveLength(3);

      // First human message (all text) should be converted
      expect(result[0].content).toBe('hi there');
      expect(result[0].getType()).toBe('human');

      // AI message (all text) should now also be converted
      expect(result[1].content).toBe('Hi Danny! How can I help you today?');
      expect(result[1].getType()).toBe('ai');

      // Third message (mixed content) should remain unchanged
      expect(result[2].content).toEqual([
        {
          type: 'text',
          text: 'what do you see',
        },
        {
          type: 'image_url',
          image_url: {
            url: 'data:image/png;base64,iVBO_SOME_BASE64_DATA=',
            detail: 'auto',
          },
        },
      ]);
    });

    it('should handle messages with tool calls', () => {
      const messages = [
        new HumanMessage({
          content: [
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Please use the calculator' },
            {
              type: ContentTypes.TOOL_CALL,
              tool_call: { name: 'calculator', args: '{"a": 1, "b": 2}' },
            },
          ],
        }),
        new AIMessage({
          content: [
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'I will calculate that for you' },
            {
              type: ContentTypes.TOOL_CALL,
              tool_call: { name: 'calculator', args: '{"a": 1, "b": 2}' },
            },
          ],
        }),
      ];

      const result = formatContentStrings(messages);

      expect(result).toHaveLength(2);
      // Should not convert because not all blocks are text
      expect(result[0].content).toEqual([
        { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Please use the calculator' },
        {
          type: ContentTypes.TOOL_CALL,
          tool_call: { name: 'calculator', args: '{"a": 1, "b": 2}' },
        },
      ]);
      expect(result[1].content).toEqual([
        { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'I will calculate that for you' },
        {
          type: ContentTypes.TOOL_CALL,
          tool_call: { name: 'calculator', args: '{"a": 1, "b": 2}' },
        },
      ]);
    });
  });
});
