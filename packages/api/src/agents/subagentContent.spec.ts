import type {
  SubagentContentMethods,
  SubagentContentBatch,
  SubagentContentScope,
} from '@librechat/data-schemas';
import type { SubagentUpdateEvent } from '@librechat/agents';
import { readSubagentContent, SubagentContentJournal } from './subagentContent';

const scope: SubagentContentScope = {
  user: 'owner',
  parentConversationId: 'parent',
  conversationId: 'child',
  taskId: 'task',
};

const update = (phase: SubagentUpdateEvent['phase'], data: unknown): SubagentUpdateEvent => ({
  runId: 'root',
  subagentRunId: 'execution',
  subagentType: 'worker',
  subagentAgentId: 'worker',
  phase,
  data,
  timestamp: '2026-10-20T00:00:00.000Z',
});

function memoryStorage() {
  const batches: SubagentContentBatch[] = [];
  const methods: SubagentContentMethods = {
    appendSubagentContentBatch: async ({ revision, fromSequence, throughSequence, eventsJson }) => {
      batches.push({ revision, fromSequence, throughSequence, eventsJson });
      return { ok: true };
    },
    getSubagentContentHead: async (_scope, throughRevision) => {
      let head: SubagentContentBatch | undefined;
      for (let index = batches.length - 1; index >= 0; index--) {
        if (throughRevision == null || batches[index].revision <= throughRevision) {
          head = batches[index];
          break;
        }
      }
      return head == null
        ? null
        : { revision: head.revision, throughSequence: head.throughSequence };
    },
    streamSubagentContentBatches: async function* (_scope, throughRevision, afterSequence = -1) {
      for (const batch of batches) {
        if (batch.revision <= throughRevision && batch.throughSequence > afterSequence) yield batch;
      }
    },
  };
  return { methods, batches };
}

const journalFor = (methods: SubagentContentMethods, batchBytes = 1_000_000) =>
  new SubagentContentJournal({
    scope,
    flushMs: 60_000,
    batchBytes,
    append: methods.appendSubagentContentBatch,
    notify: async () => undefined,
    onError: () => undefined,
  });

it('reconstructs earlier text after more than a replay window of public deltas', async () => {
  const { methods } = memoryStorage();
  const journal = journalFor(methods);
  journal.record(
    update('run_step', {
      id: 'text',
      index: 0,
      stepDetails: { type: 'message_creation', message_creation: { message_id: 'reply' } },
    }),
    0,
  );
  for (let index = 1; index <= 150; index++) {
    journal.record(
      update('message_delta', {
        id: 'text',
        delta: { content: [{ type: 'text', text: `${index},` }] },
      }),
      index,
    );
  }
  await journal.close();
  const result = await readSubagentContent(methods, scope);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'text',
        text: Array.from({ length: 150 }, (_, i) => `${i + 1},`).join(''),
      }),
    ]),
  );
  expect(result.value.throughSequence).toBe(150);
});

it('keeps full tool content larger than the previous activity projection', async () => {
  const { methods } = memoryStorage();
  const journal = journalFor(methods);
  const output = 'full-output:'.repeat(4000);
  const args = { query: 'full-arguments:'.repeat(2000) };
  journal.record(
    update('run_step', {
      id: 'tool',
      index: 0,
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [{ id: 'call', name: 'lookup', args, type: 'tool_call' }],
      },
    }),
    0,
  );
  journal.record(
    update('run_step_completed', {
      result: {
        id: 'tool',
        type: 'tool_call',
        tool_call: { id: 'call', name: 'lookup', args, output, progress: 1 },
      },
    }),
    1,
  );
  await journal.close();
  const result = await readSubagentContent(methods, scope);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(JSON.stringify(result.value.content)).toContain(output);
  expect(JSON.stringify(result.value.content)).toContain(args.query);
});

it('pins paged recovery before a racing later batch without duplicate sequences', async () => {
  const { methods } = memoryStorage();
  const journal = journalFor(methods);
  for (let sequence = 0; sequence < 12; sequence++) {
    journal.record(
      update('message_delta', {
        id: 's',
        delta: { content: [{ type: 'text', text: 'x'.repeat(250) }] },
      }),
      sequence,
    );
  }
  await journal.flush();
  const first = await readSubagentContent(methods, scope, -1, { pageBytes: 1024 });
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  const sequences = first.value.events.map((event) => event.sequence);
  journal.record(
    update('message_delta', { id: 's', delta: { content: [{ type: 'text', text: 'later' }] } }),
    12,
  );
  await journal.flush();
  let cursor = first.value.nextCursor;
  while (cursor != null) {
    const pin: { afterSequence: number; throughRevision: number } = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    const page = await readSubagentContent(methods, scope, pin.afterSequence, {
      pageBytes: 1024,
      throughRevision: pin.throughRevision,
    });
    expect(page.ok).toBe(true);
    if (!page.ok) break;
    sequences.push(...page.value.events.map((event) => event.sequence));
    cursor = page.value.nextCursor;
  }
  await journal.close();
  expect(sequences).toEqual(Array.from({ length: 12 }, (_, i) => i));
  expect(await readSubagentContent(methods, scope, 11)).toMatchObject({
    ok: true,
    value: { events: [{ sequence: 12 }] },
  });
});

it('reports a missing committed range instead of treating it as an empty response', async () => {
  const { methods, batches } = memoryStorage();
  batches.push({ revision: 2, fromSequence: 5, throughSequence: 7, eventsJson: '[]' });
  expect(await readSubagentContent(methods, scope)).toEqual({
    ok: false,
    error: { code: 'SUBAGENT_CONTENT_GAP' },
  });
});

it('bounds a blocked capture backlog without blocking child execution or claiming complete history', async () => {
  const { methods, batches } = memoryStorage();
  const errors: unknown[] = [];
  const journal = new SubagentContentJournal({
    scope,
    flushMs: 60_000,
    batchBytes: 1_000_000,
    maxPendingBytes: 1024,
    append: methods.appendSubagentContentBatch,
    notify: async () => undefined,
    onError: (error) => errors.push(error),
  });
  for (let sequence = 0; sequence < 1000; sequence++) {
    journal.record(
      update('message_delta', {
        id: 's',
        delta: { content: [{ type: 'text', text: 'x'.repeat(250) }] },
      }),
      sequence,
    );
  }
  await journal.close();
  expect(errors).toHaveLength(1);
  expect(journal.throughSequence).toBe(999);
  expect(batches[batches.length - 1]?.throughSequence).toBeLessThan(journal.throughSequence);
  expect(
    batches.reduce((size, batch) => size + Buffer.byteLength(batch.eventsJson), 0),
  ).toBeLessThan(1024);
});
