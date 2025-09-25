const { describe, it, expect, beforeEach, jest } = require('@jest/globals');
const OpenRouterClient = require('../app/clients/OpenRouterClient');

// Mock fetch
global.fetch = jest.fn();

// Mock logger
jest.mock('~/config', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

describe('OpenRouterClient Tool Calling', () => {
  let client;
  const mockApiKey = 'sk-or-test-key';

  beforeEach(() => {
    jest.clearAllMocks();
    client = new OpenRouterClient(mockApiKey, {
      modelOptions: {
        model: 'openai/gpt-4-turbo',
      },
    });
  });

  describe('chatCompletion with tools', () => {
    it('should include tools in request body when provided', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '',
              tool_calls: [{
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'calculator',
                  arguments: '{"operation":"multiply","a":5,"b":3}',
                },
              }],
            },
          }],
        }),
      };

      fetch.mockResolvedValueOnce(mockResponse);

      const tools = [{
        type: 'function',
        function: {
          name: 'calculator',
          description: 'Performs calculations',
          parameters: {
            type: 'object',
            properties: {
              operation: { type: 'string' },
              a: { type: 'number' },
              b: { type: 'number' },
            },
          },
        },
      }];

      const result = await client.chatCompletion({
        messages: [{ role: 'user', content: 'What is 5 times 3?' }],
        tools,
        tool_choice: 'auto',
      });

      // Verify fetch was called with correct parameters
      expect(fetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockApiKey}`,
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('"tools"'),
        })
      );

      // Verify the request body includes tools
      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.tools).toEqual(tools);
      expect(requestBody.tool_choice).toBe('auto');

      // Verify tool_calls are preserved in response
      expect(result.choices[0].message.tool_calls).toBeDefined();
      expect(result.choices[0].message.tool_calls[0].function.name).toBe('calculator');
    });

    it('should handle parallel_tool_calls parameter', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'Using tools...',
              tool_calls: [],
            },
          }],
        }),
      };

      fetch.mockResolvedValueOnce(mockResponse);

      await client.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        tools: [],
        parallel_tool_calls: true,
      });

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.parallel_tool_calls).toBe(true);
    });

    it('should support legacy function_call format', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '',
              function_call: {
                name: 'calculator',
                arguments: '{"a":1,"b":2}',
              },
            },
          }],
        }),
      };

      fetch.mockResolvedValueOnce(mockResponse);

      const functions = [{
        name: 'calculator',
        description: 'Calculator function',
        parameters: {},
      }];

      const result = await client.chatCompletion({
        messages: [{ role: 'user', content: 'Add 1 and 2' }],
        functions,
        function_call: 'auto',
      });

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.functions).toEqual(functions);
      expect(requestBody.function_call).toBe('auto');

      // Verify function_call is preserved in response
      expect(result.choices[0].message.function_call).toBeDefined();
    });

    it('should handle specific tool_choice', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              tool_calls: [{
                id: 'call_456',
                type: 'function',
                function: {
                  name: 'weather',
                  arguments: '{"location":"NYC"}',
                },
              }],
            },
          }],
        }),
      };

      fetch.mockResolvedValueOnce(mockResponse);

      const toolChoice = {
        type: 'function',
        function: { name: 'weather' },
      };

      await client.chatCompletion({
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [{
          type: 'function',
          function: { name: 'weather', parameters: {} },
        }],
        tool_choice: toolChoice,
      });

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.tool_choice).toEqual(toolChoice);
    });

    it('should not include tools when auto-router conflicts with fallback models', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Response' },
          }],
        }),
      };

      fetch.mockResolvedValueOnce(mockResponse);

      client.autoRouter = true;

      await client.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        models: ['gpt-4', 'claude-3'], // Fallback models
        tools: [{
          type: 'function',
          function: { name: 'test', parameters: {} },
        }],
      });

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      // When auto-router is active, fallback models shouldn't be included
      expect(requestBody.models).toBeUndefined();
    });
  });

  describe('streaming with tool calls', () => {
    it('should accumulate tool calls from stream chunks', async () => {
      // Mock a streaming response
      const mockChunks = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_789","type":"function","function":{"name":"calculator"}}]}}]}\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"a\\":"}}]}}]}\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"5,"}}]}}]}\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"b\\":3}"}}]}}]}\n',
        'data: [DONE]\n',
      ];

      let chunkIndex = 0;
      const mockStream = {
        on: jest.fn((event, handler) => {
          if (event === 'data') {
            // Simulate streaming chunks
            for (const chunk of mockChunks) {
              handler(Buffer.from(chunk));
            }
          } else if (event === 'end') {
            // Simulate stream end
            setTimeout(() => handler(), 10);
          }
        }),
        destroy: jest.fn(),
      };

      const mockResponse = {
        ok: true,
        body: mockStream,
      };

      fetch.mockResolvedValueOnce(mockResponse);

      const onProgress = jest.fn();

      const result = await client.sendCompletion(
        {
          messages: [{ role: 'user', content: 'Calculate' }],
          tools: [{
            type: 'function',
            function: { name: 'calculator', parameters: {} },
          }],
        },
        { onProgress }
      );

      // Should return formatted response with tool calls
      expect(result).toBeDefined();
      expect(result.choices).toBeDefined();
      expect(result.choices[0].message.tool_calls).toBeDefined();
      expect(result.choices[0].message.tool_calls[0]).toEqual({
        id: 'call_789',
        type: 'function',
        function: {
          name: 'calculator',
          arguments: '{"a":5,"b":3}',
        },
      });
    });

    it('should handle mixed content and tool calls in stream', async () => {
      const mockChunks = [
        'data: {"choices":[{"delta":{"content":"Let me calculate that"}}]}\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_999","type":"function","function":{"name":"calc","arguments":"{\\"x\\":10}"}}]}}]}\n',
        'data: [DONE]\n',
      ];

      const mockStream = {
        on: jest.fn((event, handler) => {
          if (event === 'data') {
            for (const chunk of mockChunks) {
              handler(Buffer.from(chunk));
            }
          } else if (event === 'end') {
            setTimeout(() => handler(), 10);
          }
        }),
        destroy: jest.fn(),
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

      const result = await client.sendCompletion(
        {
          messages: [{ role: 'user', content: 'Test' }],
          tools: [{ type: 'function', function: { name: 'calc', parameters: {} } }],
        },
        { onProgress: jest.fn() }
      );

      expect(result.choices[0].message.content).toContain('Let me calculate');
      expect(result.choices[0].message.tool_calls).toHaveLength(1);
      expect(result.choices[0].message.tool_calls[0].function.name).toBe('calc');
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: {
            message: 'Invalid tool format',
          },
        }),
      });

      await expect(
        client.chatCompletion({
          messages: [{ role: 'user', content: 'Test' }],
          tools: [{ invalid: 'tool' }],
        })
      ).rejects.toThrow('Invalid tool format');
    });

    it('should handle rate limiting', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({}),
      });

      await expect(
        client.chatCompletion({
          messages: [{ role: 'user', content: 'Test' }],
          tools: [],
        })
      ).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('getCompletion with tools', () => {
    it('should pass tools through getCompletion', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              tool_calls: [{
                id: 'call_abc',
                type: 'function',
                function: { name: 'test', arguments: '{}' },
              }],
            },
          }],
        }),
      };

      fetch.mockResolvedValueOnce(mockResponse);

      const tools = [{
        type: 'function',
        function: { name: 'test', parameters: {} },
      }];

      const result = await client.getCompletion(
        { prompt: [{ role: 'user', content: 'Test' }] },
        { tools, tool_choice: 'required' }
      );

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.tools).toEqual(tools);
      expect(requestBody.tool_choice).toBe('required');
      expect(result.choices[0].message.tool_calls).toBeDefined();
    });
  });
});