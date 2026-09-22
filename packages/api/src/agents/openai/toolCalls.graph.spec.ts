import { response } from 'express';
import { AIMessageChunk } from '@librechat/agents/langchain/messages';
import {
  ChatModelStreamHandler,
  HandlerRegistry,
  Providers,
  StandardGraph,
} from '@librechat/agents';
import type { Response } from 'express';
import type { ChatCompletionChunk, ToolCall } from './types';
import {
  createOpenAIHandlers,
  createOpenAIStreamTracker,
  createOpenAIToolCallStream,
  OpenAIRunStepHandler,
  OpenAIRunStepDeltaHandler,
  sendFinalChunk,
} from './handlers';

/** No graph event fixtures: the SDK generates run steps and deltas from real
 * AIMessageChunk instances. Only the provider transport is omitted. */
describe('tool-call projection with real SDK graph dispatch', () => {
  it.each([true, false])(
    'preserves interleaved calls across SDK steps (stream=%s)',
    async (streaming) => {
      const frames: string[] = [];
      const tracker = createOpenAIStreamTracker();
      const context = { requestId: 'test', created: 1, model: 'fixture' };
      const res: Response = Object.create(response);
      jest.spyOn(res, 'write').mockImplementation((frame) => {
        frames.push(String(frame));
        return true;
      });
      const config = { tracker, context, res };
      const stream = createOpenAIToolCallStream({ toolCalls: tracker.toolCalls });
      const handlers = streaming
        ? createOpenAIHandlers(config)
        : {
            on_run_step: new OpenAIRunStepHandler(stream),
            on_run_step_delta: new OpenAIRunStepDeltaHandler(stream),
          };
      const graph = new StandardGraph({
        runId: 'test',
        agents: [{ agentId: 'agent', provider: Providers.OPENAI, tools: [] }],
      });
      graph.config = { configurable: { run_id: 'test', thread_id: 'thread' } };
      graph.handlerRegistry = new HandlerRegistry();
      for (const [event, handler] of Object.entries(handlers)) {
        graph.handlerRegistry.register(event, handler);
      }
      const producer = new ChatModelStreamHandler();
      for (const chunk of [
        { index: 0, id: 'a', name: 'get_time', args: '' },
        { index: 1, id: 'b', name: 'get_time', args: '' },
        { index: 0, args: '{"city":' },
        { index: 1, args: '{"city":"Paris"}' },
        { index: 0, args: '"Madrid"}' },
      ]) {
        await producer.handle(
          'on_chat_model_stream',
          {
            chunk: new AIMessageChunk({
              content: '',
              tool_call_chunks: [{ ...chunk, type: 'tool_call_chunk' }],
            }),
          },
          { langgraph_node: 'agent=agent', langgraph_step: 1 },
          graph,
        );
      }
      expect([...tracker.toolCalls.values()].map((call) => call.function.arguments)).toEqual([
        '{"city":"Madrid"}',
        '{"city":"Paris"}',
      ]);
      if (streaming) {
        const received = new Map<number, ToolCall>();
        for (const frame of frames) {
          const chunk: ChatCompletionChunk = JSON.parse(frame.slice(6));
          for (const part of chunk.choices[0].delta.tool_calls ?? []) {
            const existing = received.get(part.index);
            if (existing) {
              existing.function.arguments += part.function?.arguments ?? '';
            } else {
              expect(part.id).toBeDefined();
              expect(part.function?.name).toBe('get_time');
              received.set(part.index, {
                id: part.id!,
                type: 'function',
                function: {
                  name: part.function!.name!,
                  arguments: part.function?.arguments ?? '',
                },
              });
            }
          }
        }
        expect([...received.values()]).toEqual([...tracker.toolCalls.values()]);
        await producer.handle(
          'on_chat_model_stream',
          {
            chunk: new AIMessageChunk({ content: 'Both tools completed. Here is the answer.' }),
          },
          { langgraph_node: 'agent=agent', langgraph_step: 3 },
          graph,
        );
        expect(tracker.hasText).toBe(true);
        sendFinalChunk(config, 'stop');
        const final: ChatCompletionChunk = JSON.parse(frames[frames.length - 2].slice(6));
        expect(final.choices[0].finish_reason).toBe('stop');
      }
    },
  );

  it('isolates provider index zero across agents, invocations and checkpoint namespaces', () => {
    const tracker = createOpenAIStreamTracker();
    const stream = createOpenAIToolCallStream({ toolCalls: tracker.toolCalls });
    const metadata = [
      { langgraph_node: 'agent=a', langgraph_step: 1 },
      { langgraph_node: 'agent=b', langgraph_step: 1 },
      { langgraph_node: 'agent=a', langgraph_step: 3 },
      { langgraph_node: 'agent=a', langgraph_step: 3, checkpoint_ns: 'child' },
    ];
    for (const [i, meta] of metadata.entries()) {
      stream.onRunStep(
        {
          id: `step_${i}`,
          stepDetails: { type: 'tool_calls', tool_calls: [{ id: 'call_0', name: 'get_time' }] },
        },
        meta,
      );
      stream.onRunStepDelta(
        {
          id: `step_${i}`,
          delta: { type: 'tool_calls', tool_calls: [{ index: 0, id: 'call_0', name: 'get_time' }] },
        },
        meta,
      );
    }
    for (const [i, meta] of metadata.entries()) {
      stream.onRunStepDelta(
        {
          id: `step_${i}`,
          delta: { type: 'tool_calls', tool_calls: [{ index: 0, args: JSON.stringify({ i }) }] },
        },
        meta,
      );
    }
    expect([...tracker.toolCalls.values()].map((call) => call.function.arguments)).toEqual(
      metadata.map((_, i) => JSON.stringify({ i })),
    );
    expect(new Set([...tracker.toolCalls.values()].map((call) => call.id)).size).toBe(4);
  });
});
