import type { ChatCompletionChunkChoice, OpenAIResponseContext, ToolCall } from './types';
import {
  sendFinalChunk,
  createOpenAIStreamTracker,
  createOpenAIToolCallStream,
  createOpenAIContentAggregator,
} from './handlers';
import { buildNonStreamingResponse } from './service';

type Delta = ChatCompletionChunkChoice['delta'];

/**
 * Event payloads below are the shapes `@librechat/agents` actually dispatches
 * for a Bedrock Converse stream: the run step opens a call with its id and name
 * and carries no tool-call index, the first delta fragment repeats id and name
 * with the provider's content-block index, and later fragments carry only that
 * index and an argument slice. A step's own `index` is its position in the
 * response content, which is why it appears here as an unrelated number.
 */
function runStep(stepId: string, contentIndex: number, id: string, name: string) {
  return {
    id: stepId,
    index: contentIndex,
    type: 'tool_calls',
    stepDetails: {
      type: 'tool_calls',
      tool_calls: [{ name, args: {}, id, type: 'tool_call' }],
    },
  };
}

function opensCall(stepId: string, providerIndex: number, id: string, name: string) {
  return {
    id: stepId,
    delta: {
      type: 'tool_calls',
      tool_calls: [{ name, id, index: providerIndex, type: 'tool_call_chunk' }],
    },
  };
}

function streamsArgs(stepId: string, providerIndex: number, args: string) {
  return {
    id: stepId,
    delta: {
      type: 'tool_calls',
      tool_calls: [{ args, index: providerIndex, type: 'tool_call_chunk' }],
    },
  };
}

/**
 * The accumulation an OpenAI-compatible client performs, including the rule that
 * produced the reported `AI_InvalidResponseDataError: Expected 'id' to be a
 * string`: the first chunk seen at an index must declare the call.
 */
function accumulateLikeClient(deltas: Delta[]) {
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
  for (const delta of deltas) {
    for (const fragment of delta.tool_calls ?? []) {
      const index = fragment.index as number;
      const open = calls.get(index);
      if (open === undefined) {
        if (!fragment.id || !fragment.function?.name) {
          throw new Error(`first chunk at index ${index} declares no id and name`);
        }
        calls.set(index, {
          id: fragment.id,
          name: fragment.function.name,
          arguments: fragment.function.arguments ?? '',
        });
        continue;
      }
      open.arguments += fragment.function?.arguments ?? '';
    }
  }
  return [...calls.entries()].map(([index, call]) => ({ index, ...call }));
}

function streamingBridge() {
  const deltas: Delta[] = [];
  const toolCalls = new Map<number, ToolCall>();
  const stream = createOpenAIToolCallStream({
    toolCalls,
    emit: (delta) => deltas.push(delta),
  });
  return { stream, deltas, toolCalls };
}

describe('outward tool call indexes', () => {
  it('keeps one index from the declaration through the argument fragments', () => {
    const { stream, deltas, toolCalls } = streamingBridge();

    stream.onRunStep(runStep('step_1', 1, 'call_a', 'get_time'));
    stream.onRunStepDelta(opensCall('step_1', 1, 'call_a', 'get_time'));
    stream.onRunStepDelta(streamsArgs('step_1', 1, '{"city":'));
    stream.onRunStepDelta(streamsArgs('step_1', 1, '"Madrid"}'));

    expect(deltas.flatMap((delta) => delta.tool_calls ?? []).map((call) => call.index)).toEqual([
      0, 0, 0,
    ]);
    expect(accumulateLikeClient(deltas)).toEqual([
      { index: 0, id: 'call_a', name: 'get_time', arguments: '{"city":"Madrid"}' },
    ]);
    expect([...toolCalls.values()]).toEqual([
      {
        id: 'call_a',
        type: 'function',
        function: { name: 'get_time', arguments: '{"city":"Madrid"}' },
      },
    ]);
  });

  it('declares a call once when the run step and the first fragment both name it', () => {
    const { stream, deltas } = streamingBridge();

    stream.onRunStep(runStep('step_1', 1, 'call_a', 'get_time'));
    stream.onRunStepDelta(opensCall('step_1', 1, 'call_a', 'get_time'));

    const declarations = deltas
      .flatMap((delta) => delta.tool_calls ?? [])
      .filter((call) => call.id !== undefined);
    expect(declarations).toEqual([
      { index: 0, id: 'call_a', type: 'function', function: { name: 'get_time', arguments: '' } },
    ]);
  });

  it('separates parallel calls that arrive as consecutive single-call steps', () => {
    const { stream, deltas, toolCalls } = streamingBridge();

    stream.onRunStep(runStep('step_1', 1, 'call_a', 'get_time'));
    stream.onRunStepDelta(opensCall('step_1', 0, 'call_a', 'get_time'));
    stream.onRunStepDelta(streamsArgs('step_1', 0, '{"city":"Madrid"}'));
    stream.onRunStep(runStep('step_2', 2, 'call_b', 'get_time'));
    stream.onRunStepDelta(opensCall('step_2', 1, 'call_b', 'get_time'));
    stream.onRunStepDelta(streamsArgs('step_2', 1, '{"city":"Paris"}'));

    expect(accumulateLikeClient(deltas)).toEqual([
      { index: 0, id: 'call_a', name: 'get_time', arguments: '{"city":"Madrid"}' },
      { index: 1, id: 'call_b', name: 'get_time', arguments: '{"city":"Paris"}' },
    ]);
    expect([...toolCalls.keys()]).toEqual([0, 1]);
  });

  it('allocates a new index when a later model invocation reuses provider index zero', () => {
    const { stream, deltas, toolCalls } = streamingBridge();

    stream.onRunStep(runStep('step_1', 1, 'call_a', 'get_time'));
    stream.onRunStepDelta(opensCall('step_1', 0, 'call_a', 'get_time'));
    stream.onRunStepDelta(streamsArgs('step_1', 0, '{"city":"Madrid"}'));
    stream.onRunStep(runStep('step_3', 3, 'call_b', 'get_time'));
    stream.onRunStepDelta(opensCall('step_3', 0, 'call_b', 'get_time'));
    stream.onRunStepDelta(streamsArgs('step_3', 0, '{"city":"Paris"}'));

    expect(accumulateLikeClient(deltas)).toEqual([
      { index: 0, id: 'call_a', name: 'get_time', arguments: '{"city":"Madrid"}' },
      { index: 1, id: 'call_b', name: 'get_time', arguments: '{"city":"Paris"}' },
    ]);
    expect(toolCalls.get(0)?.function.arguments).toBe('{"city":"Madrid"}');
    expect(toolCalls.get(1)?.function.arguments).toBe('{"city":"Paris"}');
  });

  it('attributes unidentified argument fragments to the call its step opened', () => {
    const { stream, deltas } = streamingBridge();

    stream.onRunStep(runStep('step_1', 1, 'call_a', 'get_time'));
    stream.onRunStepDelta(streamsArgs('step_1', 7, '{"city":"Madrid"}'));

    expect(accumulateLikeClient(deltas)).toEqual([
      { index: 0, id: 'call_a', name: 'get_time', arguments: '{"city":"Madrid"}' },
    ]);
  });

  it('drops a fragment it cannot attribute rather than charging another call', () => {
    const { stream, deltas, toolCalls } = streamingBridge();

    stream.onRunStep(runStep('step_1', 1, 'call_a', 'get_time'));
    stream.onRunStepDelta(opensCall('step_1', 0, 'call_a', 'get_time'));
    stream.onRunStep(runStep('step_2', 2, 'call_b', 'get_time'));
    stream.onRunStepDelta(opensCall('step_2', 1, 'call_b', 'get_time'));
    stream.onRunStepDelta({
      id: 'step_unknown',
      delta: { type: 'tool_calls', tool_calls: [{ index: 4, args: '{"city":"Lisbon"}' }] },
    });

    expect(toolCalls.get(0)?.function.arguments).toBe('');
    expect(toolCalls.get(1)?.function.arguments).toBe('');
    expect(accumulateLikeClient(deltas).map((call) => call.arguments)).toEqual(['', '']);
  });

  it.each([true, false])(
    'isolates repeated provider IDs across interleaved steps (stream=%s)',
    (streaming) => {
      const deltas: Delta[] = [];
      const toolCalls = new Map<number, ToolCall>();
      const stream = createOpenAIToolCallStream({
        toolCalls,
        emit: streaming ? (delta) => deltas.push(delta) : undefined,
      });
      stream.onRunStep(runStep('agent_a_turn_1', 1, 'call_0', 'get_time'));
      stream.onRunStepDelta(opensCall('agent_a_turn_1', 0, 'call_0', 'get_time'));
      stream.onRunStepDelta(streamsArgs('agent_a_turn_1', 0, '{"city":'));
      stream.onRunStep(runStep('agent_b_turn_1', 2, 'call_0', 'get_time'));
      stream.onRunStepDelta(opensCall('agent_b_turn_1', 0, 'call_0', 'get_time'));
      stream.onRunStepDelta(streamsArgs('agent_b_turn_1', 0, '{"city":"Paris"}'));
      stream.onRunStepDelta(streamsArgs('agent_a_turn_1', 0, '"Madrid"}'));
      stream.onRunStep(runStep('agent_a_turn_2', 3, 'call_0', 'get_time'));
      stream.onRunStepDelta(opensCall('agent_a_turn_2', 0, 'call_0', 'get_time'));
      stream.onRunStepDelta(streamsArgs('agent_a_turn_2', 0, '{"city":"Lisbon"}'));
      expect([...toolCalls.keys()]).toEqual([0, 1, 2]);
      expect([...toolCalls.values()].map((call) => call.function.arguments)).toEqual([
        '{"city":"Madrid"}',
        '{"city":"Paris"}',
        '{"city":"Lisbon"}',
      ]);
      if (streaming) {
        expect(accumulateLikeClient(deltas).map((call) => call.arguments)).toEqual([
          '{"city":"Madrid"}',
          '{"city":"Paris"}',
          '{"city":"Lisbon"}',
        ]);
      }
    },
  );

  it('declares OpenAI-shaped names without waiting for an identifying delta', () => {
    const { stream, deltas, toolCalls } = streamingBridge();
    stream.onRunStep({
      id: 'step_function',
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [
          {
            id: 'call_a',
            type: 'function',
            function: { name: 'get_time', arguments: '{"city":"Madrid"}' },
          },
        ],
      },
    });
    expect(toolCalls.get(0)?.function.name).toBe('get_time');
    expect(accumulateLikeClient(deltas)).toMatchObject([
      { index: 0, id: 'call_a', name: 'get_time' },
    ]);
  });

  it.each([true, false])(
    'binds multiple declared calls before ID-less fragments (explicit indexes=%s)',
    (explicit) => {
      const { stream, deltas, toolCalls } = streamingBridge();
      const indexes = explicit ? [4, 8] : [0, 1];
      stream.onRunStep({
        id: 'parallel',
        index: 12,
        stepDetails: {
          type: 'tool_calls',
          tool_calls: [
            { id: 'call_a', name: 'get_time', ...(explicit && { index: indexes[0] }) },
            { id: 'call_b', name: 'get_time', ...(explicit && { index: indexes[1] }) },
          ],
        },
      });
      stream.onRunStepDelta(streamsArgs('parallel', indexes[1], '{"city":"Paris"}'));
      stream.onRunStepDelta(streamsArgs('parallel', indexes[0], '{"city":"Madrid"}'));
      expect(accumulateLikeClient(deltas).map((call) => call.arguments)).toEqual([
        '{"city":"Madrid"}',
        '{"city":"Paris"}',
      ]);
      expect([...toolCalls.values()].map((call) => call.function.arguments)).toEqual([
        '{"city":"Madrid"}',
        '{"city":"Paris"}',
      ]);
    },
  );

  it('does not re-declare a replayed step or bind unrelated indexes to a known call', () => {
    const { stream, deltas, toolCalls } = streamingBridge();
    stream.onRunStep(runStep('step', 1, 'call_a', 'get_time'));
    stream.onRunStep(runStep('step', 1, 'call_a', 'get_time'));
    stream.onRunStepDelta(opensCall('step', 3, 'call_a', 'get_time'));
    stream.onRunStepDelta(streamsArgs('step', 9, '{"wrong":true}'));
    stream.onRunStepDelta(streamsArgs('step', 3, '{}'));
    expect(accumulateLikeClient(deltas)).toEqual([
      { index: 0, id: 'call_a', name: 'get_time', arguments: '{}' },
    ]);
    expect(toolCalls.size).toBe(1);
  });

  it('buffers identified arguments until a later name-only fragment can declare the call', () => {
    const { stream, deltas, toolCalls } = streamingBridge();
    stream.onRunStepDelta({
      id: 'step',
      delta: { type: 'tool_calls', tool_calls: [{ id: 'call_a', index: 3, args: '{"city":' }] },
    });
    expect(deltas).toEqual([]);
    stream.onRunStepDelta({
      id: 'step',
      delta: {
        type: 'tool_calls',
        tool_calls: [{ index: 3, function: { name: 'get_time', arguments: '"Madrid"}' } }],
      },
    });
    expect(accumulateLikeClient(deltas)).toEqual([
      { index: 0, id: 'call_a', name: 'get_time', arguments: '{"city":"Madrid"}' },
    ]);
    expect(toolCalls.get(0)?.function.arguments).toBe('{"city":"Madrid"}');
  });

  it('prefers identified provider indexes to declaration position', () => {
    const { stream, deltas } = streamingBridge();
    stream.onRunStep({
      id: 'step',
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [
          { id: 'call_a', name: 'get_time' },
          { id: 'call_b', name: 'get_time' },
        ],
      },
    });
    stream.onRunStepDelta(opensCall('step', 1, 'call_a', 'get_time'));
    stream.onRunStepDelta(opensCall('step', 0, 'call_b', 'get_time'));
    stream.onRunStepDelta(streamsArgs('step', 0, '{"city":"Paris"}'));
    stream.onRunStepDelta(streamsArgs('step', 1, '{"city":"Madrid"}'));
    expect(accumulateLikeClient(deltas).map((call) => call.arguments)).toEqual([
      '{"city":"Madrid"}',
      '{"city":"Paris"}',
    ]);
  });

  it('never merges unnamed-index fragments into a multi-call step', () => {
    const { stream, toolCalls } = streamingBridge();
    stream.onRunStep({
      id: 'step',
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [
          { id: 'a', name: 'get_time' },
          { id: 'b', name: 'get_time' },
        ],
      },
    });
    stream.onRunStepDelta({
      id: 'step',
      delta: { type: 'tool_calls', tool_calls: [{ args: 'unattributable' }] },
    });
    expect([...toolCalls.values()].map((call) => call.function.arguments)).toEqual(['', '']);
  });

  it('gives id-based consumers unique IDs and starts each response with fresh state', () => {
    const { stream, toolCalls } = streamingBridge();
    stream.onRunStep(runStep('s1', 1, 'call_0', 'get_time'));
    stream.onRunStep(runStep('s2', 2, 'call_0', 'get_time'));
    stream.onRunStep(runStep('s3', 3, 'call_0_1', 'get_time'));
    expect(new Set([...toolCalls.values()].map((call) => call.id)).size).toBe(3);
    const second = streamingBridge();
    second.stream.onRunStep(runStep('s1', 1, 'call_0', 'get_time'));
    expect([...second.toolCalls.keys()]).toEqual([0]);
    expect(second.toolCalls.get(0)?.id).toBe('call_0');
  });

  it('accumulates the same calls for a non-streaming response with no emitter', () => {
    const aggregator = createOpenAIContentAggregator();
    const stream = createOpenAIToolCallStream({ toolCalls: aggregator.toolCalls });

    stream.onRunStep(runStep('step_1', 1, 'call_a', 'get_time'));
    stream.onRunStepDelta(opensCall('step_1', 0, 'call_a', 'get_time'));
    stream.onRunStepDelta(streamsArgs('step_1', 0, '{"city":"Madrid"}'));
    stream.onRunStep(runStep('step_3', 3, 'call_b', 'get_time'));
    stream.onRunStepDelta(opensCall('step_3', 0, 'call_b', 'get_time'));
    stream.onRunStepDelta(streamsArgs('step_3', 0, '{"city":"Paris"}'));

    const response = buildNonStreamingResponse(
      { requestId: 'chatcmpl-test', created: 1778317637, model: 'agent_test' },
      'Checking both.',
      '',
      aggregator.toolCalls,
      { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    );

    expect(response.choices[0].message.tool_calls).toEqual([
      {
        id: 'call_a',
        type: 'function',
        function: { name: 'get_time', arguments: '{"city":"Madrid"}' },
      },
      {
        id: 'call_b',
        type: 'function',
        function: { name: 'get_time', arguments: '{"city":"Paris"}' },
      },
    ]);
  });
});

describe('finish reason for a response that called tools', () => {
  const context: OpenAIResponseContext = {
    requestId: 'chatcmpl-test',
    created: 1778317637,
    model: 'agent_test',
  };

  it('preserves stop after a server-executed tool followed by final text', () => {
    const tracker = createOpenAIStreamTracker();
    const written: string[] = [];
    const stream = createOpenAIToolCallStream({
      toolCalls: tracker.toolCalls,
      emit: () => undefined,
    });

    stream.onRunStep(runStep('step_1', 1, 'call_a', 'get_time'));

    tracker.addText();
    sendFinalChunk({
      context,
      tracker,
      res: { write: (chunk: string) => written.push(chunk) } as never,
    });

    const final = JSON.parse(written[0].replace(/^data: /, ''));
    expect(final.choices[0].finish_reason).toBe('stop');
  });

  it('preserves stop in the final non-streaming answer after server tools', () => {
    const toolCalls = new Map<number, ToolCall>();
    const stream = createOpenAIToolCallStream({ toolCalls });

    stream.onRunStep(runStep('step_1', 1, 'call_a', 'get_time'));

    const response = buildNonStreamingResponse(context, 'Checking.', '', toolCalls, {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    });

    expect(response.choices[0].finish_reason).toBe('stop');
  });
});
