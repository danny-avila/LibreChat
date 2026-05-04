import type { Response as ServerResponse } from 'express';
import {
  convertInputToMessages,
  createAggregatorEventHandlers,
  createResponseAggregator,
  createResponseContext,
  createResponsesEventHandlers,
} from '../service';
import { createResponseTracker } from '../handlers';
import type { InputItem, ResponseRequest } from '../types';

function createMockStreamConfig() {
  const writes: string[] = [];
  const res = {
    write: (chunk: string): boolean => {
      writes.push(chunk);
      return true;
    },
  } as unknown as ServerResponse;
  const tracker = createResponseTracker();
  const request: ResponseRequest = { model: 'test-model', input: '' };
  const context = createResponseContext(request, 'resp_test');
  return { writes, config: { res, context, tracker } };
}

function eventTypes(writes: string[]): string[] {
  const types: string[] = [];
  for (const chunk of writes) {
    if (chunk.startsWith('event: ')) {
      types.push(chunk.slice('event: '.length).trim());
    }
  }
  return types;
}

function dataPayloads(writes: string[]): string[] {
  const payloads: string[] = [];
  for (const chunk of writes) {
    if (chunk.startsWith('data: ') && !chunk.startsWith('data: [DONE]')) {
      payloads.push(chunk);
    }
  }
  return payloads;
}

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

describe('createResponsesEventHandlers — tool call lifecycle', () => {
  it('emits arguments.done, function_call item.done, and function_call_output on on_run_step_completed', () => {
    const { writes, config } = createMockStreamConfig();
    const { handlers } = createResponsesEventHandlers(config);

    handlers.on_run_step.handle('on_run_step', {
      stepDetails: { type: 'tool_calls', tool_calls: [{ id: 'call_1', name: 'tool_a' }] },
    });
    handlers.on_run_step_delta.handle('on_run_step_delta', {
      delta: { type: 'tool_calls', tool_calls: [{ index: 0, args: '{"x":1}' }] },
    });
    handlers.on_run_step_completed.handle('on_run_step_completed', {
      result: {
        id: 'step_1',
        index: 0,
        type: 'tool_call',
        tool_call: { id: 'call_1', name: 'tool_a', args: '{"x":1}', output: 'RESULT', progress: 1 },
      },
    });

    expect(eventTypes(writes)).toEqual([
      'response.output_item.added',
      'response.function_call_arguments.delta',
      'response.function_call_arguments.done',
      'response.output_item.done',
      'response.output_item.added',
      'response.output_item.done',
    ]);

    const payloads = dataPayloads(writes);
    const argumentsDone = payloads.find((p) => p.includes('function_call_arguments.done'));
    expect(argumentsDone).toContain('"call_id":"call_1"');
    expect(argumentsDone).toContain('"arguments":"{\\"x\\":1}"');

    const fcoAdded = payloads.find(
      (p) => p.includes('output_item.added') && p.includes('function_call_output'),
    );
    expect(fcoAdded).toContain('"call_id":"call_1"');
    expect(fcoAdded).toContain('"output":"RESULT"');
  });

  it('routes deltas to per-step call_ids across sequential multi-step tool calls', () => {
    const { writes, config } = createMockStreamConfig();
    const { handlers } = createResponsesEventHandlers(config);

    handlers.on_run_step.handle('on_run_step', {
      stepDetails: { type: 'tool_calls', tool_calls: [{ id: 'call_A', name: 'tool_a' }] },
    });
    handlers.on_run_step_delta.handle('on_run_step_delta', {
      delta: { type: 'tool_calls', tool_calls: [{ index: 0, args: 'ARGS_A' }] },
    });
    handlers.on_run_step_completed.handle('on_run_step_completed', {
      result: {
        id: 'step_A',
        index: 0,
        type: 'tool_call',
        tool_call: { id: 'call_A', output: 'R_A' },
      },
    });

    handlers.on_run_step.handle('on_run_step', {
      stepDetails: { type: 'tool_calls', tool_calls: [{ id: 'call_B', name: 'tool_b' }] },
    });
    handlers.on_run_step_delta.handle('on_run_step_delta', {
      delta: { type: 'tool_calls', tool_calls: [{ index: 0, args: 'ARGS_B' }] },
    });
    handlers.on_run_step_completed.handle('on_run_step_completed', {
      result: {
        id: 'step_B',
        index: 1,
        type: 'tool_call',
        tool_call: { id: 'call_B', output: 'R_B' },
      },
    });

    const payloads = dataPayloads(writes);

    const deltaA = payloads.find(
      (p) => p.includes('function_call_arguments.delta') && p.includes('ARGS_A'),
    );
    expect(deltaA).toContain('"call_id":"call_A"');

    const deltaB = payloads.find(
      (p) => p.includes('function_call_arguments.delta') && p.includes('ARGS_B'),
    );
    expect(deltaB).toBeDefined();
    expect(deltaB).toContain('"call_id":"call_B"');
    expect(deltaB).not.toContain('"call_id":"call_A"');

    const argsDoneA = payloads.find(
      (p) => p.includes('function_call_arguments.done') && p.includes('"call_id":"call_A"'),
    );
    expect(argsDoneA).toContain('"arguments":"ARGS_A"');

    const argsDoneB = payloads.find(
      (p) => p.includes('function_call_arguments.done') && p.includes('"call_id":"call_B"'),
    );
    expect(argsDoneB).toContain('"arguments":"ARGS_B"');
  });

  it('uses delta.tool_calls[].id when provided, overriding index lookup', () => {
    const { writes, config } = createMockStreamConfig();
    const { handlers } = createResponsesEventHandlers(config);

    handlers.on_run_step.handle('on_run_step', {
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [
          { id: 'call_A', name: 'tool_a' },
          { id: 'call_B', name: 'tool_b' },
        ],
      },
    });

    handlers.on_run_step_delta.handle('on_run_step_delta', {
      delta: { type: 'tool_calls', tool_calls: [{ id: 'call_B', index: 99, args: 'XYZ' }] },
    });

    const delta = dataPayloads(writes).find((p) => p.includes('function_call_arguments.delta'));
    expect(delta).toContain('"call_id":"call_B"');
    expect(delta).toContain('"delta":"XYZ"');
  });

  it('tops up arguments from on_run_step_completed when no deltas streamed', () => {
    const { writes, config } = createMockStreamConfig();
    const { handlers } = createResponsesEventHandlers(config);

    handlers.on_run_step.handle('on_run_step', {
      stepDetails: { type: 'tool_calls', tool_calls: [{ id: 'call_1', name: 'tool_a' }] },
    });
    // No on_run_step_delta fires — some providers send args whole.
    handlers.on_run_step_completed.handle('on_run_step_completed', {
      result: {
        id: 'step_1',
        type: 'tool_call',
        tool_call: { id: 'call_1', args: '{"x":1}', output: 'RESULT' },
      },
    });

    const payloads = dataPayloads(writes);
    const argsDone = payloads.find((p) => p.includes('function_call_arguments.done'));
    expect(argsDone).toContain('"arguments":"{\\"x\\":1}"');

    // A synthesized delta carries the full args so streaming clients stay in sync.
    const delta = payloads.find((p) => p.includes('function_call_arguments.delta'));
    expect(delta).toContain('"delta":"{\\"x\\":1}"');
  });

  it('accepts object-shaped args on on_run_step_completed and stringifies them', () => {
    const { writes, config } = createMockStreamConfig();
    const { handlers } = createResponsesEventHandlers(config);

    handlers.on_run_step.handle('on_run_step', {
      stepDetails: { type: 'tool_calls', tool_calls: [{ id: 'call_1', name: 'tool_a' }] },
    });
    handlers.on_run_step_completed.handle('on_run_step_completed', {
      result: {
        id: 'step_1',
        type: 'tool_call',
        tool_call: { id: 'call_1', args: { x: 1 }, output: 'R' },
      },
    });

    const argsDone = dataPayloads(writes).find((p) => p.includes('function_call_arguments.done'));
    expect(argsDone).toContain('"arguments":"{\\"x\\":1}"');
  });

  it('is idempotent across on_run_step_completed and on_tool_end for the same call_id', () => {
    const { writes, config } = createMockStreamConfig();
    const { handlers } = createResponsesEventHandlers(config);

    handlers.on_run_step.handle('on_run_step', {
      stepDetails: { type: 'tool_calls', tool_calls: [{ id: 'call_1', name: 'tool_a' }] },
    });
    handlers.on_run_step_completed.handle('on_run_step_completed', {
      result: { id: 'step_1', type: 'tool_call', tool_call: { id: 'call_1', output: 'R' } },
    });

    const countBefore = writes.length;

    handlers.on_tool_end.handle('on_tool_end', {
      output: { tool_call_id: 'call_1', content: 'R-again' },
    });
    expect(writes.length).toBe(countBefore);

    handlers.on_run_step_completed.handle('on_run_step_completed', {
      result: { id: 'step_x', type: 'tool_call', tool_call: { id: 'call_unknown', output: 'R' } },
    });
    expect(writes.length).toBe(countBefore);
  });
});

describe('createAggregatorEventHandlers — tool call lifecycle', () => {
  it('records tool output on on_run_step_completed (primary) and on_tool_end (web_search)', () => {
    const aggregator = createResponseAggregator();
    const handlers = createAggregatorEventHandlers(aggregator);

    handlers.on_run_step.handle('on_run_step', {
      stepDetails: { type: 'tool_calls', tool_calls: [{ id: 'call_1', name: 'tool_a' }] },
    });
    handlers.on_run_step_delta.handle('on_run_step_delta', {
      delta: { type: 'tool_calls', tool_calls: [{ index: 0, args: '{"a":1}' }] },
    });
    handlers.on_run_step_completed.handle('on_run_step_completed', {
      result: { id: 'step_1', type: 'tool_call', tool_call: { id: 'call_1', output: 'RESULT' } },
    });

    expect(aggregator.toolOutputs.get('call_1')).toBe('RESULT');
    expect(aggregator.toolCalls.get('call_1')?.arguments).toBe('{"a":1}');

    // on_tool_end also populates (for web_search).
    handlers.on_tool_end.handle('on_tool_end', {
      output: { tool_call_id: 'call_2', content: 'WEB' },
    });
    expect(aggregator.toolOutputs.get('call_2')).toBe('WEB');
  });

  it('attributes multi-step deltas to the correct call_id', () => {
    const aggregator = createResponseAggregator();
    const handlers = createAggregatorEventHandlers(aggregator);

    handlers.on_run_step.handle('on_run_step', {
      stepDetails: { type: 'tool_calls', tool_calls: [{ id: 'call_A', name: 'tool_a' }] },
    });
    handlers.on_run_step_delta.handle('on_run_step_delta', {
      delta: { type: 'tool_calls', tool_calls: [{ index: 0, args: 'ARGS_A' }] },
    });

    handlers.on_run_step.handle('on_run_step', {
      stepDetails: { type: 'tool_calls', tool_calls: [{ id: 'call_B', name: 'tool_b' }] },
    });
    handlers.on_run_step_delta.handle('on_run_step_delta', {
      delta: { type: 'tool_calls', tool_calls: [{ index: 0, args: 'ARGS_B' }] },
    });

    expect(aggregator.toolCalls.get('call_A')?.arguments).toBe('ARGS_A');
    expect(aggregator.toolCalls.get('call_B')?.arguments).toBe('ARGS_B');
  });
});
