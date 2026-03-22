import { createTranslationContext, translateEvent } from '../events';
import type { OpenClawChatEvent } from '../types';

function makeContext() {
  return createTranslationContext('msg-123', 'conv-456');
}

function makeEvent(
  state: OpenClawChatEvent['state'],
  content: OpenClawChatEvent['message']['content'] = [],
  extra: Partial<OpenClawChatEvent> = {},
): OpenClawChatEvent {
  return {
    runId: 'run-1',
    sessionKey: 'sess-1',
    seq: 0,
    state,
    message: { role: 'assistant', content },
    ...extra,
  };
}

describe('createTranslationContext', () => {
  it('initialises with empty toolCallMap and zero index', () => {
    const ctx = makeContext();
    expect(ctx.messageId).toBe('msg-123');
    expect(ctx.conversationId).toBe('conv-456');
    expect(ctx.toolCallMap.size).toBe(0);
    expect(ctx.toolCallIndex).toBe(0);
  });
});

describe('translateEvent — terminal states', () => {
  it('returns [{ final: true }] for state=final', () => {
    const result = translateEvent(makeEvent('final'), makeContext());
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ final: true });
  });

  it('returns [{ final: true, aborted: true }] for state=aborted', () => {
    const result = translateEvent(makeEvent('aborted'), makeContext());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ final: true, aborted: true });
  });

  it('returns error event with errorMessage for state=error', () => {
    const result = translateEvent(
      makeEvent('error', [], { errorMessage: 'gateway timeout' }),
      makeContext(),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ final: true, error: { message: 'gateway timeout' } });
  });

  it('uses default message when errorMessage is absent', () => {
    const result = translateEvent(makeEvent('error'), makeContext());
    expect(result[0]).toMatchObject({ final: true, error: { message: 'OpenClaw error' } });
  });

  it('returns [] for unknown state', () => {
    // @ts-expect-error intentional unknown state for robustness test
    const result = translateEvent(makeEvent('unknown'), makeContext());
    expect(result).toEqual([]);
  });
});

describe('translateEvent — delta / text block', () => {
  it('emits on_message_delta for a text block', () => {
    const ctx = makeContext();
    const result = translateEvent(
      makeEvent('delta', [{ type: 'text', text: 'hello world' }]),
      ctx,
    );
    expect(result).toHaveLength(1);
    const event = result[0] as { event: string; data: Record<string, unknown> };
    expect(event.event).toBe('on_message_delta');
    const data = event.data as { id: string; delta: { content: { type: string; value: string }[] } };
    expect(data.id).toBe('msg-123');
    expect(data.delta.content[0]).toMatchObject({ type: 'text_delta', value: 'hello world' });
  });

  it('emits on_reasoning_delta for a thinking block', () => {
    const ctx = makeContext();
    const result = translateEvent(
      makeEvent('delta', [{ type: 'thinking', thinking: 'step by step' }]),
      ctx,
    );
    expect(result).toHaveLength(1);
    const event = result[0] as { event: string; data: Record<string, unknown> };
    expect(event.event).toBe('on_reasoning_delta');
  });

  it('emits 0 events for empty content array', () => {
    const result = translateEvent(makeEvent('delta', []), makeContext());
    expect(result).toEqual([]);
  });

  it('emits events for multiple blocks in one delta', () => {
    const result = translateEvent(
      makeEvent('delta', [
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' },
      ]),
      makeContext(),
    );
    expect(result).toHaveLength(2);
  });
});

describe('translateEvent — tool_use block', () => {
  it('emits on_run_step and on_run_step_delta for a tool_use block', () => {
    const ctx = makeContext();
    const result = translateEvent(
      makeEvent('delta', [
        { type: 'tool_use', id: 'tool-1', name: 'search', input: { q: 'test' } },
      ]),
      ctx,
    );
    expect(result).toHaveLength(2);
    const [runStep, delta] = result as [
      { event: string; data: Record<string, unknown> },
      { event: string; data: Record<string, unknown> },
    ];
    expect(runStep.event).toBe('on_run_step');
    expect(delta.event).toBe('on_run_step_delta');
  });

  it('tracks tool_use ids in toolCallMap and increments toolCallIndex', () => {
    const ctx = makeContext();
    translateEvent(
      makeEvent('delta', [
        { type: 'tool_use', id: 'tool-a', name: 'fn1', input: {} },
        { type: 'tool_use', id: 'tool-b', name: 'fn2', input: {} },
      ]),
      ctx,
    );
    expect(ctx.toolCallIndex).toBe(2);
    expect(ctx.toolCallMap.get('tool-a')).toBe(0);
    expect(ctx.toolCallMap.get('tool-b')).toBe(1);
  });

  it('serialises input as JSON string in args', () => {
    const ctx = makeContext();
    const input = { foo: 'bar', n: 42 };
    const result = translateEvent(
      makeEvent('delta', [{ type: 'tool_use', id: 'tool-x', name: 'fn', input }]),
      ctx,
    );
    const delta = result[1] as {
      data: { delta: { tool_calls: { args: string }[] } };
    };
    expect(JSON.parse(delta.data.delta.tool_calls[0].args)).toEqual(input);
  });
});

describe('translateEvent — tool_result block', () => {
  it('emits on_run_step_completed using mapped stepIndex', () => {
    const ctx = makeContext();
    // Pre-populate map as if tool_use was already seen
    ctx.toolCallMap.set('tool-1', 3);

    const result = translateEvent(
      makeEvent('delta', [
        { type: 'tool_result', tool_use_id: 'tool-1', content: 'result text' },
      ]),
      ctx,
    );
    expect(result).toHaveLength(1);
    const event = result[0] as { event: string; data: { index: number; is_error: boolean } };
    expect(event.event).toBe('on_run_step_completed');
    expect(event.data.index).toBe(3);
    expect(event.data.is_error).toBe(false);
  });

  it('propagates is_error flag', () => {
    const ctx = makeContext();
    ctx.toolCallMap.set('tool-err', 0);
    const result = translateEvent(
      makeEvent('delta', [
        { type: 'tool_result', tool_use_id: 'tool-err', content: 'fail', is_error: true },
      ]),
      ctx,
    );
    const event = result[0] as { data: { is_error: boolean } };
    expect(event.data.is_error).toBe(true);
  });

  it('defaults to stepIndex 0 when tool_use_id not in map', () => {
    const ctx = makeContext();
    const result = translateEvent(
      makeEvent('delta', [
        { type: 'tool_result', tool_use_id: 'unknown', content: 'x' },
      ]),
      ctx,
    );
    const event = result[0] as { data: { index: number } };
    expect(event.data.index).toBe(0);
  });
});
