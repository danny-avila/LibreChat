import { ContentTypes, StepEvents, StepTypes } from 'librechat-data-provider';
import type {
  SubagentTaskContentSnapshot,
  SubagentTaskContentSuffix,
  SubagentContentEvent,
} from 'librechat-data-provider';
import { reduceRecoveredContent, recoverTaskContent, recoveredToolPart } from './recovery';

const snapshot = (overrides: Partial<SubagentTaskContentSnapshot> = {}): SubagentTaskContentSnapshot => ({
  mode: 'snapshot', taskId: 'task', threadId: 'thread', parentConversationId: 'parent',
  messageId: 'task:assistant', parentMessageId: 'task:user', sender: 'worker',
  revision: 1, throughSequence: 0, targetThroughSequence: 0, status: 'running', recovery: 'partial',
  content: [{ type: ContentTypes.TEXT, text: 'Opening. ', phase: 'commentary', agentId: 'child' }],
  runSteps: [{ id: 'text-step', runId: 'provider-run', index: 0, type: StepTypes.MESSAGE_CREATION,
    stepDetails: { type: StepTypes.MESSAGE_CREATION, message_creation: { message_id: 'provider' } }, usage: null }],
  ...overrides,
});
const suffix = (events: SubagentContentEvent[], overrides: Partial<SubagentTaskContentSuffix> = {}): SubagentTaskContentSuffix => {
  const { content: _content, runSteps: _steps, ...identity } = snapshot();
  return { ...identity, mode: 'suffix', afterSequence: 0, revision: 2,
    throughSequence: 1, targetThroughSequence: 1, events, ...overrides };
};
const text = (sequence: number, value: string): SubagentContentEvent => ({
  sequence,
  frame: { event: StepEvents.ON_MESSAGE_DELTA, data: { id: 'text-step', delta: {
    content: [{ type: ContentTypes.TEXT, text: value }],
  } } },
});

it('replays only committed suffix frames through the normal reducer without mutating its snapshot', () => {
  const first = reduceRecoveredContent(null, snapshot())!;
  const next = reduceRecoveredContent(first, suffix([text(1, 'Later.')]))!;
  expect(next.snapshot.content[0]).toMatchObject({ text: 'Opening. Later.', agentId: 'child', phase: 'commentary' });
  expect(first.snapshot.content[0]).toMatchObject({ text: 'Opening. ' });
  expect(first.stream.messages.get('task:assistant')?.content?.[0]).toMatchObject({ text: 'Opening. ' });
  expect(reduceRecoveredContent(next, suffix([text(1, 'Later.')]))).toBe(next);
});

it('drains opaque cursor pages at one target, including pages from the same revision', async () => {
  const load = jest.fn()
    .mockResolvedValueOnce(snapshot({ nextCursor: 'opaque cursor', targetThroughSequence: 2 }))
    .mockResolvedValueOnce(suffix([text(1, 'One. ')], { revision: 1, targetThroughSequence: 2, nextCursor: 'second' }))
    .mockResolvedValueOnce(suffix([text(2, 'Two.')], { revision: 1, afterSequence: 1, throughSequence: 2, targetThroughSequence: 2 }));
  const result = await recoverTaskContent(null, load);
  expect(load.mock.calls).toEqual([[undefined], [undefined, 'opaque cursor'], [undefined, 'second']]);
  expect(result.snapshot.content[0]).toMatchObject({ text: 'Opening. One. Two.' });
  expect(result.snapshot.throughSequence).toBe(2);
});

it('rejects non-advancing pages instead of hiding a missing prefix', async () => {
  const load = jest.fn()
    .mockResolvedValueOnce(snapshot({ nextCursor: 'cursor', targetThroughSequence: 2 }))
    .mockResolvedValueOnce(suffix([], { throughSequence: 0, targetThroughSequence: 2, nextCursor: 'cursor' }));
  await expect(recoverTaskContent(null, load)).rejects.toThrow('subagent_content_cursor_mismatch');
});

it('keeps more than 112 calls and over-24KiB arguments and outputs intact', async () => {
  const large = 'payload'.repeat(5_000);
  const content = Array.from({ length: 113 }, (_, index) => ({
    type: ContentTypes.TOOL_CALL as const, agentId: 'child', streamedIndex: index,
    tool_call: { id: `call-${index}`, name: 'bash', args: large, output: large, progress: 1,
      stepId: `step-${index}`, toolExecutionDurationMs: index + 1 },
  }));
  const result = await recoverTaskContent(null, jest.fn().mockResolvedValue(snapshot({ content })));
  expect(result.snapshot.content).toBe(content);
  expect(result.snapshot.content).toHaveLength(113);
  expect(recoveredToolPart(result.snapshot, { partIndex: 112, toolCallId: 'call-112' })?.tool_call.output).toBe(large);
});

it('requires a snapshot for a mismatched cursor or task identity', () => {
  const first = reduceRecoveredContent(null, snapshot())!;
  expect(reduceRecoveredContent(first, suffix([text(2, 'Wrong.')], { afterSequence: 1 }))).toBeNull();
  expect(reduceRecoveredContent(first, suffix([text(1, 'Wrong.')], { taskId: 'other-task' }))).toBeNull();
});

it('will not hydrate a repeated provider id from an ambiguous moved occurrence', () => {
  const part = { type: ContentTypes.TOOL_CALL as const, tool_call: { id: 'reused', name: 'bash', args: '{}' } };
  const source = snapshot({ content: [part, { ...part }] });
  expect(recoveredToolPart(source, { partIndex: 9, toolCallId: 'reused' })).toBeNull();
  expect(recoveredToolPart(source, { partIndex: 1, toolCallId: 'reused' })?.partIndex).toBe(1);
});
