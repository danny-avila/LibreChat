import { Providers } from '@librechat/agents';
import type { PostToolBatchHookInput } from '@librechat/agents';

const mockInvoke = jest.fn();
const mockInitializeModel = jest.fn(() => ({ invoke: mockInvoke }));

jest.mock('@librechat/agents', () => ({
  ...jest.requireActual('@librechat/agents'),
  initializeModel: (...args: unknown[]) => mockInitializeModel(...(args as [])),
}));

import {
  ACTIVITY_INSTRUCTION,
  buildPrompt,
  classifyBatch,
  createActivityLabelHook,
} from '../runtime';
import type { ActivityLabelBatchMeta, ActivityLabelSlot } from '../runtime';

/** Flushes the hook's detached generation chain. */
async function flushDetached(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function batchInput(overrides: Partial<PostToolBatchHookInput> = {}): PostToolBatchHookInput {
  return {
    hook_event_name: 'PostToolBatch',
    runId: 'run-1',
    entries: [
      {
        toolName: 'web_search',
        toolInput: { query: 'librechat' },
        toolUseId: 'tool-1',
        status: 'success',
        toolOutput: 'ten results about librechat',
      },
    ],
    ...overrides,
  } as PostToolBatchHookInput;
}

describe('classifyBatch', () => {
  it('collects the covered tool calls and derives batch status', () => {
    const meta = classifyBatch([
      { toolName: 'web_search', toolInput: {}, toolUseId: 'a', status: 'success', toolOutput: '' },
      { toolName: 'read_file', toolInput: {}, toolUseId: 'b', status: 'success', toolOutput: '' },
      { toolName: 'edit_file', toolInput: {}, toolUseId: 'c', status: 'error', error: 'denied' },
    ]);
    expect(meta.toolCallIds).toEqual(['a', 'b', 'c']);
    expect(meta.status).toBe('partial');
  });

  it('reports failed when every tool errors', () => {
    const meta = classifyBatch([
      { toolName: 'bash_tool', toolInput: {}, toolUseId: 'x', status: 'error', error: 'boom' },
    ]);
    expect(meta.status).toBe('failed');
  });

  /** A tool-type tally could only echo the cards under the header, so the
   *  metadata deliberately has no place to put one. */
  it('carries no tool-type tally', () => {
    const meta = classifyBatch([
      { toolName: 'bash_tool', toolInput: {}, toolUseId: 'x', status: 'success', toolOutput: '' },
    ]);
    expect(Object.keys(meta).sort()).toEqual(['status', 'toolCallIds']);
  });
});

describe('ACTIVITY_INSTRUCTION', () => {
  it('forbids restating what the tool cards already show', () => {
    expect(ACTIVITY_INSTRUCTION).toMatch(/never name the tools/i);
    expect(ACTIVITY_INSTRUCTION).toMatch(/never count them/i);
    expect(ACTIVITY_INSTRUCTION).toMatch(/never echo the arguments/i);
  });

  it('asks for a past-tense outcome, not the attempt', () => {
    expect(ACTIVITY_INSTRUCTION).toMatch(/past tense/i);
    expect(ACTIVITY_INSTRUCTION).toMatch(/outcome, not the attempt/i);
  });
});

describe('buildPrompt', () => {
  it('carries intent and marks the calls as reference material', () => {
    const prompt = buildPrompt(
      [
        {
          toolName: 'bash_tool',
          toolInput: { command: 'ls /mnt/data' },
          toolUseId: 'a',
          status: 'success',
          toolOutput: 'empty',
        },
      ],
      600,
      {
        lastAssistantText: 'Let me check what is actually in /mnt/data',
        thinkingExcerpts: ['The filesystem seems to reset between calls'],
      },
    );
    expect(prompt).toContain('Let me check what is actually in /mnt/data');
    expect(prompt).toContain('The filesystem seems to reset between calls');
    expect(prompt).toContain('do not restate these');
    /** Outputs are the whole reason this runs after the batch. */
    expect(prompt).toContain('empty');
  });

  it('uses the caller instruction verbatim when one is supplied', () => {
    const prompt = buildPrompt([], 600, undefined, 'CUSTOM RULE');
    expect(prompt.startsWith('CUSTOM RULE')).toBe(true);
    expect(prompt).not.toContain('git commit subject');
  });
});

describe('createActivityLabelHook', () => {
  let slots: Array<{ index: number; filled: Array<string | null> }>;
  let claimSlot: () => ActivityLabelSlot;
  const resolveLLM = jest.fn(async () => ({
    provider: Providers.OPENAI,
    clientOptions: { model: 'small-model' },
  }));

  beforeEach(() => {
    jest.clearAllMocks();
    slots = [];
    claimSlot = () => {
      const record = { index: slots.length, filled: [] as Array<string | null> };
      slots.push(record);
      return { index: record.index, fill: (text) => void record.filled.push(text) };
    };
    mockInvoke.mockResolvedValue({ content: ' Searched the web for LibreChat docs. ' });
  });

  it('returns {} synchronously and fills the claimed slot when the model resolves', async () => {
    const hook = createActivityLabelHook({ claimSlot, resolveLLM });
    const result = await hook(batchInput(), new AbortController().signal);
    expect(result).toEqual({});
    expect(slots).toHaveLength(1);
    expect(slots[0].filled).toHaveLength(0);

    await flushDetached();
    expect(slots[0].filled).toEqual(['Searched the web for LibreChat docs.']);
    expect(mockInitializeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: Providers.OPENAI,
        clientOptions: expect.objectContaining({ model: 'small-model', streaming: false }),
      }),
    );
  });

  it('claims no slot for an empty batch', async () => {
    const hook = createActivityLabelHook({ claimSlot, resolveLLM });
    await hook(batchInput({ entries: [] }), new AbortController().signal);
    await flushDetached();
    expect(slots).toHaveLength(0);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('fills null when generation fails, without rejecting', async () => {
    mockInvoke.mockRejectedValue(new Error('provider down'));
    const hook = createActivityLabelHook({ claimSlot, resolveLLM });
    await expect(hook(batchInput(), new AbortController().signal)).resolves.toEqual({});
    await flushDetached();
    expect(slots[0].filled).toEqual([null]);
  });

  it('fills null for blank model output', async () => {
    mockInvoke.mockResolvedValue({ content: '   ' });
    const hook = createActivityLabelHook({ claimSlot, resolveLLM });
    await hook(batchInput(), new AbortController().signal);
    await flushDetached();
    expect(slots[0].filled).toEqual([null]);
  });

  it('skips subagent scopes entirely', async () => {
    const hook = createActivityLabelHook({ claimSlot, resolveLLM });
    await hook(batchInput({ agentId: 'subagent-1' }), new AbortController().signal);
    await flushDetached();
    expect(slots).toHaveLength(0);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('passes executingAgentId through to the claimed slot metadata', async () => {
    const captured: ActivityLabelBatchMeta[] = [];
    const hook = createActivityLabelHook({
      claimSlot: (meta) => {
        captured.push(meta);
        return { index: 0, fill: () => undefined };
      },
      resolveLLM,
    });
    await hook(batchInput({ executingAgentId: 'agent-a' }), new AbortController().signal);
    await flushDetached();
    expect(captured[0].executingAgentId).toBe('agent-a');
    expect(captured[0].status).toBe('ok');
  });

  it('prefers the SDK-backed generateLabel path with a per-slot trace seed', async () => {
    const generateLabel = jest.fn(async () => 'Searched runtime release notes');
    const hook = createActivityLabelHook({ claimSlot, resolveLLM, generateLabel });
    await hook(batchInput(), new AbortController().signal);
    await flushDetached();
    expect(generateLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        traceSeed: 'run-1-activity-0',
        charLimit: 600,
        entries: expect.any(Array),
        context: expect.any(Object),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(mockInitializeModel).not.toHaveBeenCalled();
    expect(slots[0].filled).toEqual(['Searched runtime release notes']);
  });

  it('claims nothing when the host abort signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const hook = createActivityLabelHook({ claimSlot, resolveLLM, signal: controller.signal });
    await hook(batchInput(), new AbortController().signal);
    await flushDetached();
    expect(slots).toHaveLength(0);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('runs per-generation invoke callbacks and collects usage on the fallback path', async () => {
    const collect = jest.fn();
    const handleLLMEnd = jest.fn();
    const getInvokeCallbacks = jest.fn(() => ({ callbacks: [{ handleLLMEnd }], collect }));
    const hook = createActivityLabelHook({ claimSlot, resolveLLM, getInvokeCallbacks });
    await hook(batchInput(), new AbortController().signal);
    await flushDetached();
    expect(getInvokeCallbacks).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ callbacks: [{ handleLLMEnd }] }),
    );
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('memoizes LLM resolution and enforces maxPerRun', async () => {
    const hook = createActivityLabelHook({ claimSlot, resolveLLM, maxPerRun: 2 });
    await hook(batchInput(), new AbortController().signal);
    await hook(batchInput(), new AbortController().signal);
    await hook(batchInput(), new AbortController().signal);
    await flushDetached();
    expect(slots).toHaveLength(2);
    expect(resolveLLM).toHaveBeenCalledTimes(1);
  });
});
