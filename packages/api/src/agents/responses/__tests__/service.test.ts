import { convertInputToMessages } from '../service';
import type { InputItem } from '../types';

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
