const { ToolMessage } = require('@langchain/core/messages');
const { ContentTypes } = require('librechat-data-provider');
const { HumanMessage, AIMessage, SystemMessage } = require('@langchain/core/messages');
const { formatAgentMessages } = require('./formatMessages');

describe('formatAgentMessages', () => {
  it('should format simple user and AI messages', () => {
    const payload = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];
    const result = formatAgentMessages(payload);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(HumanMessage);
    expect(result[1]).toBeInstanceOf(AIMessage);
  });

  it('should handle system messages', () => {
    const payload = [{ role: 'system', content: 'You are a helpful assistant.' }];
    const result = formatAgentMessages(payload);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(SystemMessage);
  });

  it('should format messages with content arrays', () => {
    const payload = [
      {
        role: 'user',
        content: [{ type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Hello' }],
      },
    ];
    const result = formatAgentMessages(payload);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(HumanMessage);
  });

  it('should handle tool calls and create ToolMessages', () => {
    const payload = [
      {
        role: 'assistant',
        content: [
          {
            type: ContentTypes.TEXT,
            [ContentTypes.TEXT]: 'Let me check that for you.',
            tool_call_ids: ['123'],
          },
          {
            type: ContentTypes.TOOL_CALL,
            tool_call: {
              id: '123',
              name: 'search',
              args: '{"query":"weather"}',
              output: 'The weather is sunny.',
            },
          },
        ],
      },
    ];
    const result = formatAgentMessages(payload);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(AIMessage);
    expect(result[1]).toBeInstanceOf(ToolMessage);
    expect(result[0].tool_calls).toHaveLength(1);
    expect(result[1].tool_call_id).toBe('123');
  });

  it('should handle multiple content parts in assistant messages', () => {
    const payload = [
      {
        role: 'assistant',
        content: [
          { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Part 1' },
          { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Part 2' },
        ],
      },
    ];
    const result = formatAgentMessages(payload);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(AIMessage);
    expect(result[0].content).toHaveLength(2);
  });

  it('should throw an error for invalid tool call structure', () => {
    const payload = [
      {
        role: 'assistant',
        content: [
          {
            type: ContentTypes.TOOL_CALL,
            tool_call: {
              id: '123',
              name: 'search',
              args: '{"query":"weather"}',
              output: 'The weather is sunny.',
            },
          },
        ],
      },
    ];
    expect(() => formatAgentMessages(payload)).toThrow('Invalid tool call structure');
  });

  it('should handle tool calls with non-JSON args', () => {
    const payload = [
      {
        role: 'assistant',
        content: [
          { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Checking...', tool_call_ids: ['123'] },
          {
            type: ContentTypes.TOOL_CALL,
            tool_call: {
              id: '123',
              name: 'search',
              args: 'non-json-string',
              output: 'Result',
            },
          },
        ],
      },
    ];
    const result = formatAgentMessages(payload);
    expect(result).toHaveLength(2);
    expect(result[0].tool_calls[0].args).toStrictEqual({ input: 'non-json-string' });
  });

  it('should handle complex tool calls with multiple steps', () => {
    const payload = [
      {
        role: 'assistant',
        content: [
          {
            type: ContentTypes.TEXT,
            [ContentTypes.TEXT]: 'I\'ll search for that information.',
            tool_call_ids: ['search_1'],
          },
          {
            type: ContentTypes.TOOL_CALL,
            tool_call: {
              id: 'search_1',
              name: 'search',
              args: '{"query":"weather in New York"}',
              output: 'The weather in New York is currently sunny with a temperature of 75°F.',
            },
          },
          {
            type: ContentTypes.TEXT,
            [ContentTypes.TEXT]: 'Now, I\'ll convert the temperature.',
            tool_call_ids: ['convert_1'],
          },
          {
            type: ContentTypes.TOOL_CALL,
            tool_call: {
              id: 'convert_1',
              name: 'convert_temperature',
              args: '{"temperature": 75, "from": "F", "to": "C"}',
              output: '23.89°C',
            },
          },
          { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Here\'s your answer.' },
        ],
      },
    ];

    const result = formatAgentMessages(payload);

    expect(result).toHaveLength(5);
    expect(result[0]).toBeInstanceOf(AIMessage);
    expect(result[1]).toBeInstanceOf(ToolMessage);
    expect(result[2]).toBeInstanceOf(AIMessage);
    expect(result[3]).toBeInstanceOf(ToolMessage);
    expect(result[4]).toBeInstanceOf(AIMessage);

    // Check first AIMessage
    expect(result[0].content).toBe('I\'ll search for that information.');
    expect(result[0].tool_calls).toHaveLength(1);
    expect(result[0].tool_calls[0]).toEqual({
      id: 'search_1',
      name: 'search',
      args: { query: 'weather in New York' },
    });

    // Check first ToolMessage
    expect(result[1].tool_call_id).toBe('search_1');
    expect(result[1].name).toBe('search');
    expect(result[1].content).toBe(
      'The weather in New York is currently sunny with a temperature of 75°F.',
    );

    // Check second AIMessage
    expect(result[2].content).toBe('Now, I\'ll convert the temperature.');
    expect(result[2].tool_calls).toHaveLength(1);
    expect(result[2].tool_calls[0]).toEqual({
      id: 'convert_1',
      name: 'convert_temperature',
      args: { temperature: 75, from: 'F', to: 'C' },
    });

    // Check second ToolMessage
    expect(result[3].tool_call_id).toBe('convert_1');
    expect(result[3].name).toBe('convert_temperature');
    expect(result[3].content).toBe('23.89°C');

    // Check final AIMessage
    expect(result[4].content).toStrictEqual([
      { [ContentTypes.TEXT]: 'Here\'s your answer.', type: ContentTypes.TEXT },
    ]);
  });

  it.skip('should not produce two consecutive assistant messages and format content correctly', () => {
    const payload = [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: [{ type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Hi there!' }],
      },
      {
        role: 'assistant',
        content: [{ type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'How can I help you?' }],
      },
      { role: 'user', content: 'What\'s the weather?' },
      {
        role: 'assistant',
        content: [
          {
            type: ContentTypes.TEXT,
            [ContentTypes.TEXT]: 'Let me check that for you.',
            tool_call_ids: ['weather_1'],
          },
          {
            type: ContentTypes.TOOL_CALL,
            tool_call: {
              id: 'weather_1',
              name: 'check_weather',
              args: '{"location":"New York"}',
              output: 'Sunny, 75°F',
            },
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'Here\'s the weather information.' },
        ],
      },
    ];

    const result = formatAgentMessages(payload);

    // Check correct message count and types
    expect(result).toHaveLength(6);
    expect(result[0]).toBeInstanceOf(HumanMessage);
    expect(result[1]).toBeInstanceOf(AIMessage);
    expect(result[2]).toBeInstanceOf(HumanMessage);
    expect(result[3]).toBeInstanceOf(AIMessage);
    expect(result[4]).toBeInstanceOf(ToolMessage);
    expect(result[5]).toBeInstanceOf(AIMessage);

    // Check content of messages
    expect(result[0].content).toStrictEqual([
      { [ContentTypes.TEXT]: 'Hello', type: ContentTypes.TEXT },
    ]);
    expect(result[1].content).toStrictEqual([
      { [ContentTypes.TEXT]: 'Hi there!', type: ContentTypes.TEXT },
      { [ContentTypes.TEXT]: 'How can I help you?', type: ContentTypes.TEXT },
    ]);
    expect(result[2].content).toStrictEqual([
      { [ContentTypes.TEXT]: 'What\'s the weather?', type: ContentTypes.TEXT },
    ]);
    expect(result[3].content).toBe('Let me check that for you.');
    expect(result[4].content).toBe('Sunny, 75°F');
    expect(result[5].content).toStrictEqual([
      { [ContentTypes.TEXT]: 'Here\'s the weather information.', type: ContentTypes.TEXT },
    ]);

    // Check that there are no consecutive AIMessages
    const messageTypes = result.map((message) => message.constructor);
    for (let i = 0; i < messageTypes.length - 1; i++) {
      expect(messageTypes[i] === AIMessage && messageTypes[i + 1] === AIMessage).toBe(false);
    }

    // Additional check to ensure the consecutive assistant messages were combined
    expect(result[1].content).toHaveLength(2);
  });
});
