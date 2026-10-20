import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import type { SubagentTaskRuntime, SubagentUpdateEvent } from '@librechat/agents';
import type { AllMethods, SubagentContentScope } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';
import {
  SubagentContentJournal,
  createSubagentTaskContentHandler,
  readSubagentContent,
} from './subagentContent';
import { buildSubagentThreadTaskConfig, SubagentThreadTaskStore } from './subagentThreads';

let mongo: MongoMemoryServer;
let methods: AllMethods;
const stores: SubagentThreadTaskStore[] = [];

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ instance: { args: ['--nounixsocket'] } });
  createModels(mongoose);
  await mongoose.connect(mongo.getUri());
  methods = createMethods(mongoose);
});
afterEach(async () => {
  await Promise.all(
    stores.splice(0).map(async (store) => {
      await store.destroyTaskControlTransport();
      store.destroyActivityStream();
    }),
  );
  await Promise.all(
    ['Conversation', 'Message', 'SubagentContent'].map((name) =>
      mongoose.models[name].deleteMany({}),
    ),
  );
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const progress = (phase: SubagentUpdateEvent['phase'], data: unknown): SubagentUpdateEvent => ({
  runId: 'root',
  parentRunId: 'parent-run',
  subagentRunId: 'execution',
  subagentType: 'researcher',
  subagentKind: 'agent',
  subagentAgentId: 'researcher',
  parentToolCallId: 'dispatch',
  phase,
  data,
  timestamp: new Date().toISOString(),
});

async function until(predicate: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for content persistence');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function runningTask(
  run: (runtime: SubagentTaskRuntime) => Promise<{ content: string }>,
  contentSettlementTimeoutMs = 1000,
) {
  const user = 'content-owner';
  const parentConversationId = randomUUID();
  await methods.saveConvo(
    { userId: user },
    { conversationId: parentConversationId, title: 'Parent' },
  );
  const store = new SubagentThreadTaskStore(methods, {
    activity: { contentRecoveryEnabled: true, contentFlushMs: 10, contentSettlementTimeoutMs },
  });
  stores.push(store);
  const config = buildSubagentThreadTaskConfig(store, { userId: user, parentConversationId });
  const started = store.start({
    scopeId: config.scopeId,
    idempotencyKey: randomUUID(),
    parentRunId: randomUUID(),
    parentAgentId: 'parent-agent',
    parentToolCallId: randomUUID(),
    input: 'Investigate',
    subagentKind: 'agent',
    subagentType: 'researcher',
    run,
  });
  if (!started.accepted || started.task.threadId == null) throw new Error('Task rejected');
  const scope: SubagentContentScope = {
    user,
    parentConversationId,
    conversationId: started.task.threadId,
    taskId: started.task.taskId,
  };
  return { store, scope, scopeId: config.scopeId };
}

function appFor(scope: SubagentContentScope, user: string | null = scope.user, tenantId?: string) {
  const app = express();
  app.use((req, _res, next) => {
    if (user != null) {
      (req as ServerRequest).user = { id: user, tenantId } as ServerRequest['user'];
    }
    next();
  });
  const handler = createSubagentTaskContentHandler(methods);
  app.get(
    '/api/convos/:parentConversationId/subagents/:threadId/tasks/:taskId/content',
    (req, res) => handler(req as ServerRequest, res),
  );
  const url = `/api/convos/${scope.parentConversationId}/subagents/${scope.conversationId}/tasks/${scope.taskId}/content`;
  return { app, url };
}

it('cold-opens >100 public events and large arguments/output without running work again, then hands off terminal content', async () => {
  let finish: (value: { content: string }) => void = () => undefined;
  const result = new Promise<{ content: string }>((resolve) => {
    finish = resolve;
  });
  let executions = 0;
  const output = 'whole tool body '.repeat(30_000);
  const args = { query: 'full arguments '.repeat(10_000) };
  const { scope, store, scopeId } = await runningTask(async (runtime) => {
    executions++;
    runtime.reportProgress(
      progress('run_step', {
        id: 'message-step',
        index: 0,
        type: 'message_creation',
        stepDetails: {
          type: 'message_creation',
          message_creation: { message_id: 'visible-message' },
        },
      }),
    );
    for (let index = 0; index < 150; index++) {
      runtime.reportProgress(
        progress('message_delta', {
          id: 'message-step',
          delta: { content: [{ type: 'text', text: `${index},` }] },
        }),
      );
    }
    runtime.reportProgress(
      progress('run_step', {
        id: 'tool-step',
        index: 1,
        type: 'tool_calls',
        stepDetails: {
          type: 'tool_calls',
          tool_calls: [{ id: 'call-1', type: 'tool_call', name: 'lookup', args }],
        },
      }),
    );
    runtime.reportProgress(
      progress('run_step_completed', {
        result: {
          id: 'tool-step',
          type: 'tool_call',
          tool_call: { id: 'call-1', name: 'lookup', args, output, progress: 1 },
        },
      }),
    );
    return result;
  });
  await until(async () => (await methods.getSubagentContentHead(scope))?.throughSequence === 152);
  const { app, url } = appFor(scope);
  const opened = await request(app).get(url).expect(200);
  expect(opened.body).toMatchObject({
    mode: 'snapshot',
    status: 'running',
    recovery: 'partial',
    targetThroughSequence: 152,
    messageId: `${scope.taskId}:assistant`,
    parentMessageId: `${scope.taskId}:user`,
  });
  expect(JSON.stringify(opened.body.content)).toContain('0,1,2,');
  expect(JSON.stringify(opened.body.content)).toContain('148,149,');
  expect(opened.body.nextCursor).toBeDefined();
  const suffix = await request(app)
    .get(`${url}?cursor=${encodeURIComponent(opened.body.nextCursor)}`)
    .expect(200);
  expect(suffix.body).toMatchObject({
    mode: 'suffix',
    throughSequence: 152,
    targetThroughSequence: 152,
  });
  expect(suffix.body.events.at(-1).frame.data.result.tool_call.output).toBe(output);
  expect(JSON.stringify(opened.body.content)).toContain(args.query);
  expect(opened.body.runSteps.map((step: { id: string }) => step.id)).toEqual([
    'message-step',
    'tool-step',
  ]);
  expect(executions).toBe(1);
  expect(JSON.stringify(opened.body)).not.toContain('subagentTranscript');
  finish({ content: 'Done' });
  await until(async () => store.get(scopeId, scope.taskId)?.status === 'completed');
  const terminal = await request(app).get(url).expect(200);
  expect(terminal.body).toMatchObject({
    status: 'completed',
    recovery: 'complete',
    targetThroughSequence: 152,
  });
  expect(terminal.body.content).toEqual(opened.body.content);
  expect(await store.claimTask(scopeId, scope.taskId)).toMatchObject({
    status: 'completed',
    result: 'Done',
  });
  expect(executions).toBe(1);
});

it('denies owner, parent, tenant and missing-task access before journal reads', async () => {
  const { scope } = await runningTask(async () => ({ content: 'Done' }));
  const read = jest.spyOn(methods, 'getSubagentContentHead');
  const anonymous = appFor(scope, null);
  await request(anonymous.app).get(anonymous.url).expect(404);
  const unauthorized = appFor(scope, 'other-owner');
  await request(unauthorized.app).get(unauthorized.url).expect(404);
  const foreignTenant = appFor(scope, scope.user, 'other-tenant');
  await request(foreignTenant.app).get(foreignTenant.url).expect(404);
  const wrongParent = appFor({ ...scope, parentConversationId: randomUUID() });
  await request(wrongParent.app).get(wrongParent.url).expect(404);
  const missingTask = appFor({ ...scope, taskId: 'missing' });
  await request(missingTask.app).get(missingTask.url).expect(404);
  expect(read).not.toHaveBeenCalled();
  read.mockRestore();
});

it('keeps a snapshot at its sampled revision and returns the racing suffix exactly once', async () => {
  let release: (value: { content: string }) => void = () => undefined;
  const running = new Promise<{ content: string }>((resolve) => {
    release = resolve;
  });
  const { scope } = await runningTask(async () => running);
  await until(
    async () =>
      (await methods.getMessages({ user: scope.user, conversationId: scope.conversationId }))
        .length > 0,
  );
  const journal = new SubagentContentJournal({
    scope,
    flushMs: 10_000,
    batchBytes: 1_000_000,
    append: methods.appendSubagentContentBatch,
    notify: async () => undefined,
    onError: () => undefined,
  });
  const delta = (text: string) =>
    progress('message_delta', { id: 's', delta: { content: [{ type: 'text', text }] } });
  journal.record(delta('first'), 0);
  await journal.flush();
  const sampled = await methods.getSubagentContentHead(scope);
  journal.record(delta('second'), 1);
  await journal.flush();
  const snapshot = await readSubagentContent(
    { ...methods, getSubagentContentHead: async () => sampled },
    scope,
  );
  expect(snapshot).toMatchObject({ ok: true, value: { revision: 1, throughSequence: 0 } });
  const suffix = await readSubagentContent(methods, scope, 0);
  expect(suffix).toMatchObject({
    ok: true,
    value: { revision: 2, throughSequence: 1, events: [{ sequence: 1 }] },
  });
  expect(suffix.ok && suffix.value.events).toHaveLength(1);
  expect(await readSubagentContent(methods, scope, 1)).toMatchObject({
    ok: true,
    value: { events: [] },
  });
  expect(await readSubagentContent(methods, scope, 2)).toMatchObject({
    ok: false,
    error: { code: 'SUBAGENT_CONTENT_AHEAD' },
  });
  await journal.close();
  release({ content: 'Done' });
});

it('pins paged suffixes to the original revision without losing or repeating events', async () => {
  let release: (value: { content: string }) => void = () => undefined;
  const running = new Promise<{ content: string }>((resolve) => {
    release = resolve;
  });
  const { scope } = await runningTask(async () => running);
  await until(
    async () =>
      (await methods.getMessages({ user: scope.user, conversationId: scope.conversationId }))
        .length > 0,
  );
  const journal = new SubagentContentJournal({
    scope,
    flushMs: 10_000,
    batchBytes: 1024,
    append: methods.appendSubagentContentBatch,
    notify: async () => undefined,
    onError: () => undefined,
  });
  for (let sequence = 0; sequence < 40; sequence++) {
    journal.record(
      progress('message_delta', {
        id: 's',
        delta: { content: [{ type: 'text', text: `${sequence}:${'x'.repeat(200)}` }] },
      }),
      sequence,
    );
  }
  await journal.flush();
  const first = await readSubagentContent(methods, scope, -1, { pageBytes: 1024 });
  if (!first.ok) throw new Error('Expected first page');
  const sequences = first.value.events.map((event) => event.sequence);
  let cursor = first.value.nextCursor;
  journal.record(
    progress('message_delta', {
      id: 's',
      delta: { content: [{ type: 'text', text: 'racing suffix' }] },
    }),
    40,
  );
  await journal.flush();
  while (cursor != null) {
    const pin: { afterSequence: number; throughRevision: number } = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    const page = await readSubagentContent(methods, scope, pin.afterSequence, {
      pageBytes: 1024,
      throughRevision: pin.throughRevision,
    });
    if (!page.ok) throw new Error('Expected suffix page');
    sequences.push(...page.value.events.map((event) => event.sequence));
    cursor = page.value.nextCursor;
  }
  expect(sequences).toEqual(Array.from({ length: 40 }, (_, index) => index));
  expect(await readSubagentContent(methods, scope, 39)).toMatchObject({
    ok: true,
    value: { events: [{ sequence: 40 }] },
  });
  await journal.close();
  release({ content: 'Done' });
});

it('retains failed-batch bytes for retry and reports a missing committed range instead of plausible empty history', async () => {
  let release: (value: { content: string }) => void = () => undefined;
  const running = new Promise<{ content: string }>((resolve) => {
    release = resolve;
  });
  const { scope } = await runningTask(async () => running);
  await until(
    async () =>
      (await methods.getMessages({ user: scope.user, conversationId: scope.conversationId }))
        .length > 0,
  );
  const append = jest
    .fn(methods.appendSubagentContentBatch)
    .mockRejectedValueOnce(new Error('database unavailable'));
  const journal = new SubagentContentJournal({
    scope,
    flushMs: 10_000,
    batchBytes: 1_000_000,
    append,
    notify: async () => undefined,
    onError: () => undefined,
  });
  journal.record(
    progress('message_delta', {
      id: 's',
      delta: { content: [{ type: 'text', text: 'retained' }] },
    }),
    0,
  );
  await expect(journal.flush()).rejects.toThrow('database unavailable');
  await expect(journal.flush()).resolves.toEqual({ ok: true });
  expect(append.mock.calls[0][0].eventsJson).toBe(append.mock.calls[1][0].eventsJson);
  expect(append.mock.calls[1][0].revision).toBe(1);
  await mongoose.models.SubagentContent.deleteMany({ taskId: scope.taskId, fragment: { $gte: 0 } });
  await expect(readSubagentContent(methods, scope)).rejects.toThrow('Incomplete committed');
  await journal.close();
  release({ content: 'Done' });
});

it('expires and deletes task journals with the owning messages, without resurrecting deleted work', async () => {
  const { scope, store, scopeId } = await runningTask(async (runtime) => {
    runtime.reportProgress(
      progress('message_delta', {
        id: 's',
        delta: { content: [{ type: 'text', text: 'visible' }] },
      }),
    );
    return { content: 'Done' };
  });
  await until(async () => store.get(scopeId, scope.taskId)?.status === 'completed');
  expect(await methods.getSubagentContentHead(scope)).not.toBeNull();
  const { app, url } = appFor(scope);
  await mongoose.models.Message.updateMany(
    { conversationId: scope.conversationId },
    { $set: { expiredAt: new Date(0) } },
  );
  await request(app).get(url).expect(404);
  await methods.deleteMessages({ user: scope.user, conversationId: scope.conversationId });
  expect(await mongoose.models.SubagentContent.countDocuments({ taskId: scope.taskId })).toBe(0);
  expect(
    await methods.appendSubagentContentBatch({
      ...scope,
      revision: 2,
      fromSequence: 1,
      throughSequence: 1,
      eventsJson: '[]',
    }),
  ).toEqual({ ok: false, error: { code: 'SUBAGENT_CONTENT_GONE' } });
  await request(app).get(url).expect(404);
});

it('keeps partial public content on task failure and never discloses a recovery exception', async () => {
  const { scope, store, scopeId } = await runningTask(async (runtime) => {
    runtime.reportProgress(
      progress('run_step', {
        id: 's',
        index: 0,
        type: 'message_creation',
        stepDetails: { type: 'message_creation', message_creation: { message_id: 'visible' } },
      }),
    );
    runtime.reportProgress(
      progress('message_delta', {
        id: 's',
        delta: { content: [{ type: 'text', text: 'Partial work' }] },
      }),
    );
    throw new Error('provider failure');
  });
  await until(async () => store.get(scopeId, scope.taskId)?.status === 'error');
  const { app, url } = appFor(scope);
  const partial = await request(app).get(url).expect(200);
  expect(partial.body).toMatchObject({
    status: 'failed',
    throughSequence: 1,
    recovery: 'complete',
  });
  expect(JSON.stringify(partial.body.content)).toContain('Partial work');
  const read = jest
    .spyOn(methods, 'getSubagentContentHead')
    .mockRejectedValueOnce(new Error('private database payload'));
  const failed = await request(app).get(url).expect(503);
  expect(failed.body).toEqual({
    error: 'Subagent content unavailable',
    code: 'SUBAGENT_CONTENT_UNAVAILABLE',
  });
  expect(JSON.stringify(failed.body)).not.toContain('private');
  read.mockRestore();
});

it('settles the child result and releases ownership when final content persistence stalls', async () => {
  let release: () => void = () => undefined;
  const pending = new Promise<{ ok: false; error: { code: 'SUBAGENT_CONTENT_GONE' } }>(
    (resolve) => {
      release = () => resolve({ ok: false, error: { code: 'SUBAGENT_CONTENT_GONE' } });
    },
  );
  const append = jest
    .spyOn(methods, 'appendSubagentContentBatch')
    .mockImplementation(() => pending);
  try {
    const { scope, store, scopeId } = await runningTask(async (runtime) => {
      runtime.reportProgress(
        progress('message_delta', {
          id: 's',
          delta: { content: [{ type: 'text', text: 'Partial capture' }] },
        }),
      );
      return { content: 'Durable task result' };
    }, 100);
    await until(async () => store.get(scopeId, scope.taskId)?.status === 'completed');
    expect(store.isThreadActiveForOwner(scope.user, scope.conversationId)).toBe(false);
    const terminal = (
      await methods.getMessages(
        { user: scope.user, conversationId: scope.conversationId },
        '+subagentContent',
      )
    ).find((message) => message.messageId === `${scope.taskId}:assistant`);
    expect(terminal).toMatchObject({
      text: 'Durable task result',
      subagentContent: { version: 1, throughSequence: 0 },
    });
    const { app, url } = appFor(scope);
    const response = await request(app).get(url).expect(200);
    expect(response.body).toMatchObject({
      status: 'completed',
      recovery: 'partial',
      throughSequence: -1,
    });
    expect(await store.claimTask(scopeId, scope.taskId)).toMatchObject({
      status: 'completed',
      result: 'Durable task result',
    });
  } finally {
    release();
    append.mockRestore();
  }
});
