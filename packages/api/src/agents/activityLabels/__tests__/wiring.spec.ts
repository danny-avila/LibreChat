import { Providers } from '@librechat/agents';
import type { PostToolBatchHookInput } from '@librechat/agents';
import type { LooseContentPart } from '../wiring';
import {
  captureActivityBlockContext,
  createActivityLabelWiring,
  stripActivityLabelParts,
  synthesizeActivityLabelGapEvents,
} from '../wiring';

async function flushDetached(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const batchInput = (): PostToolBatchHookInput =>
  ({
    hook_event_name: 'PostToolBatch',
    runId: 'run-1',
    entries: [
      {
        toolName: 'web_search',
        toolInput: { query: 'x' },
        toolUseId: 'tool-1',
        status: 'success',
        toolOutput: 'ok',
      },
    ],
  }) as PostToolBatchHookInput;

describe('createActivityLabelWiring', () => {
  it('captures block context BEFORE pushing the label part', async () => {
    const parts: Array<LooseContentPart | null | undefined> = [
      { type: 'think', think: 'Comparing runtime versions before searching' },
      { type: 'tool_call', tool_call: { id: 'tool-1' } },
    ];
    const generateLabel = jest.fn(async () => 'Searched runtime versions');
    const { hook } = createActivityLabelWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      resolveLLM: jest.fn(async () => ({
        provider: Providers.OPENAI,
        clientOptions: { model: 'm' },
      })),
      generateLabel,
    });

    await hook(batchInput(), new AbortController().signal);
    await flushDetached();

    expect(generateLabel).toHaveBeenCalledTimes(1);
    const payload = generateLabel.mock.calls[0][0] as {
      context: { thinkingExcerpts?: string[] };
    };
    expect(payload.context.thinkingExcerpts).toEqual([
      'Comparing runtime versions before searching',
    ]);
    /** And the label part landed at the tail with the claimed index. */
    expect(parts[2]).toMatchObject({ type: 'activity_label', pending: false });
  });
});

describe('captureActivityBlockContext', () => {
  it('stops reasoning collection at a prior label but keeps intent', () => {
    const parts: LooseContentPart[] = [
      { type: 'text', text: 'Let me verify each runtime.' },
      { type: 'think', think: 'Earlier batch reasoning' },
      { type: 'activity_label', activity_label: 'Searched Node versions' },
      { type: 'think', think: 'Current batch reasoning' },
    ];
    const context = captureActivityBlockContext(parts);
    expect(context.thinkingExcerpts).toEqual(['Current batch reasoning']);
    expect(context.lastAssistantText).toBe('Let me verify each runtime.');
  });

  it('filters reasoning by executing agent in multi-agent runs', () => {
    const parts: LooseContentPart[] = [
      { type: 'think', think: 'Agent B reasoning', agentId: 'agent-b' },
      { type: 'think', think: 'Agent A reasoning', agentId: 'agent-a' },
    ];
    const context = captureActivityBlockContext(parts, 'agent-a');
    expect(context.thinkingExcerpts).toEqual(['Agent A reasoning']);
  });
});

describe('stripActivityLabelParts', () => {
  it('removes label parts and keeps the reference when none exist', () => {
    const withLabel = [{ content: [{ type: 'text', text: 'hi' }, { type: 'activity_label' }] }];
    const stripped = stripActivityLabelParts(withLabel);
    expect(stripped[0].content).toHaveLength(1);

    const clean = [{ content: [{ type: 'text', text: 'hi' }] }];
    expect(stripActivityLabelParts(clean)).toBe(clean);
  });
});

describe('captureActivityBlockContext intent filtering', () => {
  it("skips another agent's tail text when resolving intent", () => {
    const parts: LooseContentPart[] = [
      { type: 'text', text: 'Agent A plan for this batch', agentId: 'agent-a' },
      { type: 'text', text: 'Agent B unrelated narration', agentId: 'agent-b' },
    ];
    const context = captureActivityBlockContext(parts, 'agent-a');
    expect(context.lastAssistantText).toBe('Agent A plan for this batch');
  });
});

describe('synthesizeActivityLabelGapEvents', () => {
  const meta = { conversationId: 'c1', responseMessageId: 'm1' };

  it('re-emits a label filled during the snapshot gap', () => {
    const snapshot: LooseContentPart[] = [
      { type: 'tool_call', tool_call: { id: 't1' } },
      { type: 'activity_label', activity_label: '', pending: true },
    ];
    const fresh: LooseContentPart[] = [
      { type: 'tool_call', tool_call: { id: 't1' } },
      { type: 'activity_label', activity_label: 'Searched release notes', pending: false },
    ];
    const events = synthesizeActivityLabelGapEvents(snapshot, fresh, meta);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('on_activity_label');
    expect(events[0].data).toMatchObject({ index: 1, conversationId: 'c1' });
  });

  it('re-emits a label claimed entirely within the gap', () => {
    const fresh: LooseContentPart[] = [
      { type: 'tool_call', tool_call: { id: 't1' } },
      { type: 'activity_label', activity_label: '', pending: true },
    ];
    expect(synthesizeActivityLabelGapEvents([fresh[0]], fresh, meta)).toHaveLength(1);
  });

  it('emits nothing when the snapshot already matches', () => {
    const parts: LooseContentPart[] = [
      { type: 'activity_label', activity_label: 'Same label', pending: false },
    ];
    expect(synthesizeActivityLabelGapEvents(parts, parts, meta)).toEqual([]);
  });
});

describe('createActivityLabelWiring close gate', () => {
  it('drops a late fill once the response has finalized', async () => {
    const parts: Array<LooseContentPart | null | undefined> = [
      { type: 'tool_call', tool_call: { id: 'tool-1' } },
    ];
    const emitLabelEvent = jest.fn(async () => undefined);
    let closed = false;
    let releaseLabel: (value: string) => void = () => undefined;
    const generateLabel = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          releaseLabel = resolve;
        }),
    );
    const { hook } = createActivityLabelWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent,
      trackPendingFill: jest.fn(),
      isClosed: () => closed,
      resolveLLM: jest.fn(async () => ({
        provider: Providers.OPENAI,
        clientOptions: { model: 'm' },
      })),
      generateLabel,
    });

    await hook(batchInput(), new AbortController().signal);
    await flushDetached();
    /** Claim-time placeholder emitted; label still in flight. */
    expect(emitLabelEvent).toHaveBeenCalledTimes(1);

    /** Settle timed out: the scope closes, then the straggler resolves. */
    closed = true;
    releaseLabel('Late label that must not land');
    await flushDetached();

    expect(emitLabelEvent).toHaveBeenCalledTimes(1);
    const labelPart = parts[1] as LooseContentPart;
    expect(labelPart.activity_label).toBe('');
    expect(labelPart.pending).toBe(true);
  });
});
