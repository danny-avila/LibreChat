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

  describe('Non-human messages', () => {
    it('should not modify AI message content', () => {
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
      expect(result[0].content).toEqual([
        { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Hello' },
        { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'World' },
      ]);
    });

    it('should not modify System message content', () => {
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
      expect(result[0].content).toEqual([
        { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'System' },
        { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Message' },
      ]);
    });
  });

  describe('Mixed message types', () => {
    it('should only process human messages in mixed array', () => {
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
      // Human message should be converted
      expect(result[0].content).toBe('Human\nMessage');
      // AI message should remain unchanged
      expect(result[1].content).toEqual([
        { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'AI' },
        { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Response' },
      ]);
      // System message should remain unchanged
      expect(result[2].content).toEqual([
        { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'System' },
        { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Prompt' },
      ]);
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

    it('should not modify the original messages array', () => {
      const messages = [
        new HumanMessage({
          content: [
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Hello' },
            { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'World' },
          ],
        }),
      ];

      const originalContent = [
        ...(messages[0].content as Array<{ type: string; [key: string]: unknown }>),
      ];
      formatContentStrings(messages);

      expect(messages[0].content).toEqual(originalContent);
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

      // AI message should remain unchanged
      expect(result[1].content).toEqual([
        {
          type: 'text',
          text: 'Hi Danny! How can I help you today?',
        },
      ]);

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

    it('should handle human messages with tool calls', () => {
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
      ];

      const result = formatContentStrings(messages);

      expect(result).toHaveLength(1);
      // Should not convert because not all blocks are text
      expect(result[0].content).toEqual([
        { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Please use the calculator' },
        {
          type: ContentTypes.TOOL_CALL,
          tool_call: { name: 'calculator', args: '{"a": 1, "b": 2}' },
        },
      ]);
    });
  });
});
