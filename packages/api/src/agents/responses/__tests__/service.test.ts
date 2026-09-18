import type { Response as ServerResponse } from 'express';
import type { InputItem, ResponseContext } from '../types';
import {
  buildAggregatedResponse,
  convertInputToMessages,
  createAggregatorEventHandlers,
  createResponseAggregator,
  createResponsesEventHandlers,
  validateResponseRequest,
  createResponseContext,
  buildResponsesUsage,
} from '../service';
import { buildResponse, createResponseTracker } from '../handlers';

describe('response usage aggregation', () => {
  const context: ResponseContext = {
    responseId: 'resp_test',
    model: 'agent_test',
    createdAt: 1778317637,
  };

  it('accumulates usage across parent and subagent model calls', () => {
    const aggregator = createResponseAggregator();
    const handlers = createAggregatorEventHandlers(aggregator);

    handlers.on_chat_model_end.handle('on_chat_model_end', {
      output: {
        usage_metadata: {
          input_tokens: 100,
          output_tokens: 40,
          input_token_details: { cache_read: 10 },
        },
      },
    });
    handlers.on_chat_model_end.handle('on_chat_model_end', {
      output: {
        usage_metadata: {
          input_tokens: 25,
          output_tokens: 15,
          cache_read_input_tokens: 5,
        },
      },
    });

    expect(aggregator.usage).toEqual({
      inputTokens: 125,
      outputTokens: 55,
      reasoningTokens: 0,
      cachedTokens: 15,
    });
  });

  it('builds one normalized wire total with an identity-free child breakdown', () => {
    const usage = buildResponsesUsage([
      { input_tokens: 100, output_tokens: 40, provider: 'openAI' },
      {
        input_tokens: 25,
        output_tokens: 10,
        provider: 'openAI',
        usage_type: 'subagent',
        input_token_details: { cache_read: 5 },
      },
    ]);

    expect(usage).toEqual({
      input_tokens: 125,
      output_tokens: 50,
      total_tokens: 175,
      input_tokens_details: { cached_tokens: 5 },
      output_tokens_details: { reasoning_tokens: 0 },
      primary: { input_tokens: 100, output_tokens: 40, total_tokens: 140 },
      subagent: { input_tokens: 25, output_tokens: 10, total_tokens: 35 },
    });

    const response = buildAggregatedResponse(context, createResponseAggregator(), usage);
    expect(response.usage).toEqual(usage);
  });

  it('uses the normalized override in the completed streaming event', () => {
    const writes: string[] = [];
    const res = {
      write: (chunk: string) => {
        writes.push(chunk);
      },
    } as unknown as ServerResponse;
    const tracker = createResponseTracker();
    const usage = buildResponsesUsage([
      { input_tokens: 100, output_tokens: 40, provider: 'openAI' },
      {
        input_tokens: 25,
        output_tokens: 10,
        provider: 'openAI',
        usage_type: 'subagent',
      },
    ]);

    createResponsesEventHandlers({ res, context, tracker }).finalizeStream(usage);

    const completed = writes.find((chunk) => chunk.startsWith('data: {'));
    expect(JSON.parse(completed?.slice(6) ?? '{}').response.usage).toEqual(usage);
  });
});

describe('convertInputToMessages', () => {
  // ── String input shorthand ─────────────────────────────────────────
  it('converts a string input to a single user message', () => {
    const result = convertInputToMessages('Hello');
    expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  // ── Empty input array ──────────────────────────────────────────────
  it('returns an empty array for empty input', () => {
    const result = convertInputToMessages([]);
    expect(result).toEqual([]);
  });

  // ── Role mapping ───────────────────────────────────────────────────
  it('maps developer role to system', () => {
    const input: InputItem[] = [
      { type: 'message', role: 'developer', content: 'You are helpful.' },
    ];
    expect(convertInputToMessages(input)).toEqual([
      { role: 'system', content: 'You are helpful.' },
    ]);
  });

  it('maps system role to system', () => {
    const input: InputItem[] = [{ type: 'message', role: 'system', content: 'System prompt.' }];
    expect(convertInputToMessages(input)).toEqual([{ role: 'system', content: 'System prompt.' }]);
  });

  it('maps user role to user', () => {
    const input: InputItem[] = [{ type: 'message', role: 'user', content: 'Hi' }];
    expect(convertInputToMessages(input)).toEqual([{ role: 'user', content: 'Hi' }]);
  });

  it('maps assistant role to assistant', () => {
    const input: InputItem[] = [{ type: 'message', role: 'assistant', content: 'Hello!' }];
    expect(convertInputToMessages(input)).toEqual([{ role: 'assistant', content: 'Hello!' }]);
  });

  it('defaults unknown roles to user', () => {
    const input = [
      { type: 'message', role: 'unknown_role', content: 'test' },
    ] as unknown as InputItem[];
    expect(convertInputToMessages(input)[0].role).toBe('user');
  });

  // ── input_text content blocks ──────────────────────────────────────
  it('converts input_text blocks to text blocks', () => {
    const input: InputItem[] = [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Hello world' }],
      },
    ];
    const result = convertInputToMessages(input);
    expect(result).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Hello world' }] }]);
  });

  // ── output_text content blocks (the original bug) ──────────────────
  it('converts output_text blocks to text blocks', () => {
    const input: InputItem[] = [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'I can help!', annotations: [], logprobs: [] }],
      },
    ];
    const result = convertInputToMessages(input);
    expect(result).toEqual([
      { role: 'assistant', content: [{ type: 'text', text: 'I can help!' }] },
    ]);
  });

  // ── refusal content blocks ─────────────────────────────────────────
  it('converts refusal blocks to text blocks', () => {
    const input: InputItem[] = [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'refusal', refusal: 'I cannot do that.' }],
      },
    ];
    const result = convertInputToMessages(input);
    expect(result).toEqual([
      { role: 'assistant', content: [{ type: 'text', text: 'I cannot do that.' }] },
    ]);
  });

  // ── input_image content blocks ─────────────────────────────────────
  it('converts input_image blocks to image_url blocks', () => {
    const input: InputItem[] = [
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_image', image_url: 'https://example.com/img.png', detail: 'high' },
        ],
      },
    ];
    const result = convertInputToMessages(input);
    expect(result).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: 'https://example.com/img.png', detail: 'high' },
          },
        ],
      },
    ]);
  });

  // ── input_file content blocks ──────────────────────────────────────
  it('converts input_file blocks to text placeholders', () => {
    const input: InputItem[] = [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_file', filename: 'report.pdf', file_id: 'f_123' }],
      },
    ];
    const result = convertInputToMessages(input);
    expect(result).toEqual([
      { role: 'user', content: [{ type: 'text', text: '[File: report.pdf]' }] },
    ]);
  });

  it('uses "unknown" for input_file without filename', () => {
    const input: InputItem[] = [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_file', file_id: 'f_123' }],
      },
    ];
    const result = convertInputToMessages(input);
    expect(result).toEqual([
      { role: 'user', content: [{ type: 'text', text: '[File: unknown]' }] },
    ]);
  });

  // ── Null / undefined filtering ─────────────────────────────────────
  it('filters out null elements in content arrays', () => {
    const input = [
      {
        type: 'message',
        role: 'user',
        content: [null, { type: 'input_text', text: 'valid' }, undefined],
      },
    ] as unknown as InputItem[];
    const result = convertInputToMessages(input);
    expect(result).toEqual([{ role: 'user', content: [{ type: 'text', text: 'valid' }] }]);
  });

  // ── Missing text field defaults to empty string ────────────────────
  it('defaults to empty string when text field is missing on input_text', () => {
    const input = [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text' }],
      },
    ] as unknown as InputItem[];
    const result = convertInputToMessages(input);
    expect(result).toEqual([{ role: 'user', content: [{ type: 'text', text: '' }] }]);
  });

  it('defaults to empty string when text field is missing on output_text', () => {
    const input = [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text' }],
      },
    ] as unknown as InputItem[];
    const result = convertInputToMessages(input);
    expect(result).toEqual([{ role: 'assistant', content: [{ type: 'text', text: '' }] }]);
  });

  it('defaults to empty string when refusal field is missing on refusal block', () => {
    const input = [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'refusal' }],
      },
    ] as unknown as InputItem[];
    const result = convertInputToMessages(input);
    expect(result).toEqual([{ role: 'assistant', content: [{ type: 'text', text: '' }] }]);
  });

  // ── Unknown block types are filtered out ───────────────────────────
  it('filters out unknown content block types', () => {
    const input = [
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: 'keep me' },
          { type: 'some_future_type', data: 'ignore' },
        ],
      },
    ] as unknown as InputItem[];
    const result = convertInputToMessages(input);
    expect(result).toEqual([{ role: 'user', content: [{ type: 'text', text: 'keep me' }] }]);
  });

  // ── Mixed valid/invalid content in same array ──────────────────────
  it('handles mixed valid and invalid content blocks', () => {
    const input = [
      {
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'output_text', text: 'Hello', annotations: [], logprobs: [] },
          null,
          { type: 'unknown_type' },
          { type: 'refusal', refusal: 'No can do' },
        ],
      },
    ] as unknown as InputItem[];
    const result = convertInputToMessages(input);
    expect(result).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'No can do' },
        ],
      },
    ]);
  });

  // ── Non-array, non-string content defaults to empty string ─────────
  it('defaults to empty string for non-array non-string content', () => {
    const input = [{ type: 'message', role: 'user', content: 42 }] as unknown as InputItem[];
    const result = convertInputToMessages(input);
    expect(result).toEqual([{ role: 'user', content: '' }]);
  });

  // ── Function call items ────────────────────────────────────────────
  it('converts function_call items to assistant messages with tool_calls', () => {
    const input: InputItem[] = [
      {
        type: 'function_call',
        id: 'fc_1',
        call_id: 'call_abc',
        name: 'get_weather',
        arguments: '{"city":"NYC"}',
      },
    ];
    const result = convertInputToMessages(input);
    expect(result).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_abc',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"NYC"}' },
          },
        ],
      },
    ]);
  });

  // ── Function call output items ─────────────────────────────────────
  it('converts function_call_output items to tool messages', () => {
    const input: InputItem[] = [
      {
        type: 'function_call_output',
        call_id: 'call_abc',
        output: '{"temp":72}',
      },
    ];
    const result = convertInputToMessages(input);
    expect(result).toEqual([
      {
        role: 'tool',
        content: '{"temp":72}',
        tool_call_id: 'call_abc',
      },
    ]);
  });

  // ── Item references are skipped ────────────────────────────────────
  it('skips item_reference items', () => {
    const input: InputItem[] = [
      { type: 'item_reference', id: 'ref_123' },
      { type: 'message', role: 'user', content: 'Hello' },
    ];
    const result = convertInputToMessages(input);
    expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  // ── Multi-turn conversation (the real-world scenario) ──────────────
  it('handles a full multi-turn conversation with output_text blocks', () => {
    const input: InputItem[] = [
      {
        type: 'message',
        role: 'developer',
        content: [{ type: 'input_text', text: 'You are a helpful assistant.' }],
      },
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'What is 2+2?' }],
      },
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: '2+2 is 4.', annotations: [], logprobs: [] }],
      },
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'And 3+3?' }],
      },
    ];
    const result = convertInputToMessages(input);
    expect(result).toEqual([
      { role: 'system', content: [{ type: 'text', text: 'You are a helpful assistant.' }] },
      { role: 'user', content: [{ type: 'text', text: 'What is 2+2?' }] },
      { role: 'assistant', content: [{ type: 'text', text: '2+2 is 4.' }] },
      { role: 'user', content: [{ type: 'text', text: 'And 3+3?' }] },
    ]);
  });
});

describe('tool call argument attribution', () => {
  /** Reproduces the SQL Console construct run: an MCP lookup, then a caller-declared submit_sql. */
  it('keeps arguments with their own call when a run makes two calls in separate steps', () => {
    const aggregator = createResponseAggregator();
    const handlers = createAggregatorEventHandlers(aggregator);

    handlers.on_run_step.handle('on_run_step', {
      id: 'step_1',
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [{ id: 'toolu_lookup', name: 'list_tables' }],
      },
    });
    handlers.on_run_step_delta.handle('on_run_step_delta', {
      id: 'step_1',
      delta: {
        type: 'tool_calls',
        tool_calls: [{ id: 'toolu_lookup', index: 1, args: '{"database":' }],
      },
    });
    handlers.on_run_step_delta.handle('on_run_step_delta', {
      id: 'step_1',
      delta: { type: 'tool_calls', tool_calls: [{ index: 1, args: '"default"}' }] },
    });

    handlers.on_run_step.handle('on_run_step', {
      id: 'step_2',
      stepDetails: { type: 'tool_calls', tool_calls: [{ id: 'toolu_submit', name: 'submit_sql' }] },
    });
    handlers.on_run_step_delta.handle('on_run_step_delta', {
      id: 'step_2',
      delta: {
        type: 'tool_calls',
        tool_calls: [{ id: 'toolu_submit', index: 1, args: '{"sql":' }],
      },
    });
    handlers.on_run_step_delta.handle('on_run_step_delta', {
      id: 'step_2',
      delta: { type: 'tool_calls', tool_calls: [{ index: 1, args: '"SELECT 1"}' }] },
    });

    expect(aggregator.toolCalls.get('toolu_lookup')?.arguments).toBe('{"database":"default"}');
    expect(aggregator.toolCalls.get('toolu_submit')?.arguments).toBe('{"sql":"SELECT 1"}');
  });

  it('separates two calls made in one step under provider content-block indexes', () => {
    const aggregator = createResponseAggregator();
    const handlers = createAggregatorEventHandlers(aggregator);

    handlers.on_run_step.handle('on_run_step', {
      id: 'step_1',
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [
          { id: 'toolu_a', name: 'list_tables' },
          { id: 'toolu_b', name: 'submit_sql' },
        ],
      },
    });
    handlers.on_run_step_delta.handle('on_run_step_delta', {
      id: 'step_1',
      delta: {
        type: 'tool_calls',
        tool_calls: [
          { id: 'toolu_a', index: 1, args: '{"a":1}' },
          { id: 'toolu_b', index: 2, args: '{"sql":' },
        ],
      },
    });
    handlers.on_run_step_delta.handle('on_run_step_delta', {
      id: 'step_1',
      delta: { type: 'tool_calls', tool_calls: [{ index: 2, args: '"SELECT 2"}' }] },
    });

    expect(aggregator.toolCalls.get('toolu_a')?.arguments).toBe('{"a":1}');
    expect(aggregator.toolCalls.get('toolu_b')?.arguments).toBe('{"sql":"SELECT 2"}');
  });

  it('attributes an index-less chunk to the only call in the step', () => {
    const aggregator = createResponseAggregator();
    const handlers = createAggregatorEventHandlers(aggregator);

    handlers.on_run_step.handle('on_run_step', {
      id: 'step_1',
      stepDetails: { type: 'tool_calls', tool_calls: [{ id: 'toolu_only', name: 'submit_sql' }] },
    });
    handlers.on_run_step_delta.handle('on_run_step_delta', {
      id: 'step_1',
      delta: { type: 'tool_calls', tool_calls: [{ args: '{"sql":"SELECT 3"}' }] },
    });

    expect(aggregator.toolCalls.get('toolu_only')?.arguments).toBe('{"sql":"SELECT 3"}');
  });

  it('drops an unattributable chunk rather than guessing between two calls', () => {
    const aggregator = createResponseAggregator();
    const handlers = createAggregatorEventHandlers(aggregator);

    handlers.on_run_step.handle('on_run_step', {
      id: 'step_1',
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [
          { id: 'toolu_a', name: 'list_tables' },
          { id: 'toolu_b', name: 'submit_sql' },
        ],
      },
    });
    handlers.on_run_step_delta.handle('on_run_step_delta', {
      id: 'step_1',
      delta: { type: 'tool_calls', tool_calls: [{ index: 7, args: '{"sql":"nope"}' }] },
    });

    expect(aggregator.toolCalls.get('toolu_a')?.arguments).toBe('');
    expect(aggregator.toolCalls.get('toolu_b')?.arguments).toBe('');
  });

  it('seeds arguments a provider delivers on the step instead of as deltas', () => {
    const aggregator = createResponseAggregator();
    const handlers = createAggregatorEventHandlers(aggregator);

    handlers.on_run_step.handle('on_run_step', {
      id: 'step_1',
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [{ id: 'toolu_whole', name: 'submit_sql', args: '{"sql":"SELECT 4"}' }],
      },
    });

    expect(aggregator.toolCalls.get('toolu_whole')?.arguments).toBe('{"sql":"SELECT 4"}');
  });

  it('ignores a non-string args object rather than stringifying it', () => {
    const aggregator = createResponseAggregator();
    const handlers = createAggregatorEventHandlers(aggregator);

    handlers.on_run_step.handle('on_run_step', {
      id: 'step_1',
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [{ id: 'toolu_obj', name: 'submit_sql', args: {} }],
      },
    });
    handlers.on_run_step_delta.handle('on_run_step_delta', {
      id: 'step_1',
      delta: { type: 'tool_calls', tool_calls: [{ id: 'toolu_obj', args: { sql: 'SELECT 5' } }] },
    });

    expect(aggregator.toolCalls.get('toolu_obj')?.arguments).toBe('');
  });
});

describe('tool call arguments from the completed model message', () => {
  const SQL = 'SELECT\n    created_at\nFROM default.analytics_test_v2\nLIMIT 100';

  /**
   * The SQL Console construct run: the provider sent list_tables as fragments and submit_sql
   * whole, so only the completed message carries the query.
   */
  it('fills arguments for a call the provider delivered without fragments', () => {
    const aggregator = createResponseAggregator();
    const handlers = createAggregatorEventHandlers(aggregator);

    handlers.on_run_step.handle('on_run_step', {
      id: 'step_1',
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [{ id: 'toolu_lookup', name: 'list_tables' }],
      },
    });
    handlers.on_run_step_delta.handle('on_run_step_delta', {
      id: 'step_1',
      delta: {
        type: 'tool_calls',
        tool_calls: [{ id: 'toolu_lookup', index: 1, args: '{"database":"default"}' }],
      },
    });
    handlers.on_chat_model_end.handle('on_chat_model_end', {
      output: {
        tool_calls: [{ id: 'toolu_lookup', args: { database: 'default' } }],
      },
    });

    handlers.on_run_step.handle('on_run_step', {
      id: 'step_2',
      stepDetails: { type: 'tool_calls', tool_calls: [{ id: 'toolu_submit', name: 'submit_sql' }] },
    });
    handlers.on_chat_model_end.handle('on_chat_model_end', {
      output: { tool_calls: [{ id: 'toolu_submit', args: { sql: SQL } }] },
    });

    expect(aggregator.toolCalls.get('toolu_lookup')?.arguments).toBe('{"database":"default"}');
    expect(JSON.parse(aggregator.toolCalls.get('toolu_submit')?.arguments ?? '{}')).toEqual({
      sql: SQL,
    });
  });

  it('leaves fragment-accumulated arguments untouched', () => {
    const aggregator = createResponseAggregator();
    const handlers = createAggregatorEventHandlers(aggregator);

    handlers.on_run_step.handle('on_run_step', {
      id: 'step_1',
      stepDetails: { type: 'tool_calls', tool_calls: [{ id: 'toolu_a', name: 'submit_sql' }] },
    });
    handlers.on_run_step_delta.handle('on_run_step_delta', {
      id: 'step_1',
      delta: { type: 'tool_calls', tool_calls: [{ id: 'toolu_a', args: '{"sql":"SELECT 1"}' }] },
    });
    handlers.on_chat_model_end.handle('on_chat_model_end', {
      output: { tool_calls: [{ id: 'toolu_a', args: { sql: 'SELECT 999' } }] },
    });

    expect(aggregator.toolCalls.get('toolu_a')?.arguments).toBe('{"sql":"SELECT 1"}');
  });

  it('ignores completed calls the run never announced, and usage still accumulates', () => {
    const aggregator = createResponseAggregator();
    const handlers = createAggregatorEventHandlers(aggregator);

    handlers.on_chat_model_end.handle('on_chat_model_end', {
      output: {
        usage_metadata: { input_tokens: 10, output_tokens: 2 },
        tool_calls: [{ id: 'toolu_unknown', args: { sql: 'SELECT 1' } }],
      },
    });

    expect(aggregator.toolCalls.size).toBe(0);
    expect(aggregator.usage.inputTokens).toBe(10);
  });
});

/**
 * The continuation a caller-executed tool needs. `previous_response_id` cannot
 * carry a tool exchange — a turn is persisted as text, so neither item of the
 * pair survives it — which leaves replaying both items in `input` as the only
 * supported shape. See the `clientTools` module docstring.
 */
describe('client tool continuation replay', () => {
  const CALL_ID = 'call_submit_1';

  it('pairs a replayed function_call with its output, adjacently', () => {
    const input: InputItem[] = [
      { type: 'message', role: 'user', content: 'Run the query' },
      {
        type: 'function_call',
        id: 'fc_1',
        call_id: CALL_ID,
        name: 'submit_sql',
        arguments: '{"sql":"SELECT 1"}',
      },
      { type: 'function_call_output', call_id: CALL_ID, output: 'submitted' },
    ];

    expect(convertInputToMessages(input)).toEqual([
      { role: 'user', content: 'Run the query' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: CALL_ID,
            type: 'function',
            function: { name: 'submit_sql', arguments: '{"sql":"SELECT 1"}' },
          },
        ],
      },
      { role: 'tool', content: 'submitted', tool_call_id: CALL_ID },
    ]);
  });

  /**
   * What a caller gets wrong by following the OpenAI habit of sending only the
   * output: the tool result arrives with no call to answer, which providers
   * reject. Pinned so the replay requirement is not silently relaxed.
   */
  it('leaves a bare function_call_output without a call to answer', () => {
    const messages = convertInputToMessages([
      { type: 'function_call_output', call_id: CALL_ID, output: 'submitted' },
    ]);

    expect(messages).toEqual([{ role: 'tool', content: 'submitted', tool_call_id: CALL_ID }]);
    expect(
      messages.some((message) =>
        (message as { tool_calls?: Array<{ id: string }> }).tool_calls?.some(
          (toolCall) => toolCall.id === CALL_ID,
        ),
      ),
    ).toBe(false);
  });
});

describe('reported tools and tool_choice', () => {
  const context: ResponseContext = {
    responseId: 'resp_test',
    model: 'agent_test',
    createdAt: 1778317637,
  };

  /**
   * `tool_choice` is never forwarded to the model, so echoing the request's ask
   * would tell the caller a directive was applied when the run ignored it.
   */
  it.each([
    ['required', 'required'],
    ['none', 'none'],
    ['a specific function', { type: 'function', name: 'submit_sql' }],
  ])('reports tool_choice as auto when the request asked for %s', (_label, toolChoice) => {
    const { request } = validateResponseRequest({
      model: 'agent_test',
      input: 'hi',
      tool_choice: toolChoice,
    });
    const built = createResponseContext(request!, 'resp_test');

    expect(built).not.toHaveProperty('toolChoice');
    expect(buildAggregatedResponse(built, createResponseAggregator()).tool_choice).toBe('auto');
    expect(buildResponse(built, createResponseTracker(), 'completed').tool_choice).toBe('auto');
  });

  it('does not report a request tool until the run resolves which ones applied', () => {
    const { request } = validateResponseRequest({
      model: 'agent_test',
      input: 'hi',
      tools: [{ type: 'function', name: 'submit_sql' }],
    });
    const built = createResponseContext(request!, 'resp_test');

    expect(built.tools).toBeUndefined();
    expect(buildAggregatedResponse(built, createResponseAggregator()).tools).toEqual([]);
  });

  it('reports the applied tools the run recorded on the context', () => {
    const applied: ResponseContext = {
      ...context,
      tools: [{ type: 'function', name: 'submit_sql' }],
    };

    expect(buildAggregatedResponse(applied, createResponseAggregator()).tools).toEqual([
      { type: 'function', name: 'submit_sql' },
    ]);
    expect(buildResponse(applied, createResponseTracker(), 'completed').tools).toEqual([
      { type: 'function', name: 'submit_sql' },
    ]);
  });

  it('rejects a malformed tools entry at ingress', () => {
    expect(
      validateResponseRequest({ model: 'agent_test', input: 'hi', tools: ['submit_sql'] }),
    ).toEqual({ valid: false, error: expect.stringContaining('tools[0] must be an object') });
  });
});
