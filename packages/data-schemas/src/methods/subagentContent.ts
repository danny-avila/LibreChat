import { createHash } from 'node:crypto';
import type { Model } from 'mongoose';
import type { ISubagentContentChunk } from '~/models/subagentContent';
import type { IConversation, IMessage } from '~/types';
import { tenantSafeBulkWrite } from '~/utils/tenantBulkWrite';
import { activeExpirationFilter } from '~/utils/retention';

export type SubagentContentScope = {
  user: string;
  tenantId?: string;
  parentConversationId: string;
  conversationId: string;
  taskId: string;
};

export type SubagentContentHead = { revision: number; throughSequence: number };
export type SubagentContentBatch = SubagentContentHead & {
  fromSequence: number;
  eventsJson: string;
};

export type SubagentContentAppendResult =
  | { ok: true }
  | { ok: false; error: { code: 'SUBAGENT_CONTENT_GONE' } };

const tenantFilter = (tenantId?: string) =>
  tenantId == null ? { tenantId: { $exists: false } } : { tenantId };
const scopeFilter = (scope: SubagentContentScope) => ({
  ...scope,
  ...tenantFilter(scope.tenantId),
});

/** Fragments keep even a single large tool body well below Mongo's BSON ceiling.
 * This is a storage encoding, not a content-retention limit. */
const FRAGMENT_CHARS = 128 * 1024;

export function createSubagentContentMethods(mongoose: typeof import('mongoose')): {
  appendSubagentContentBatch: (
    input: SubagentContentScope & SubagentContentBatch & { leaseToken?: string },
  ) => Promise<SubagentContentAppendResult>;
  getSubagentContentHead: (scope: SubagentContentScope, throughRevision?: number) => Promise<SubagentContentHead | null>;
  streamSubagentContentBatches: (
    scope: SubagentContentScope,
    throughRevision: number,
    afterSequence?: number,
  ) => AsyncIterable<SubagentContentBatch>;
} {
  const contentModel = () => mongoose.models.SubagentContent as Model<ISubagentContentChunk>;

  async function appendSubagentContentBatch(
    input: SubagentContentScope & SubagentContentBatch & { leaseToken?: string },
  ): Promise<SubagentContentAppendResult> {
    const { revision, fromSequence, throughSequence, eventsJson, leaseToken, ...scope } = input;
    if (
      !Number.isSafeInteger(revision) || revision < 1 ||
      !Number.isSafeInteger(fromSequence) || fromSequence < 0 ||
      !Number.isSafeInteger(throughSequence) || throughSequence < fromSequence
    ) {
      throw new Error('Invalid subagent content batch');
    }
    const Message = mongoose.models.Message as Model<IMessage>;
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const owner = { user: scope.user, ...tenantFilter(scope.tenantId) };
    const inputFilter = {
      ...owner,
      conversationId: scope.conversationId,
      messageId: `${scope.taskId}:user`,
      ...activeExpirationFilter<IMessage>(),
    };
    const [seed, parent, child] = await Promise.all([
      Message.findOne(inputFilter).select('expiredAt').lean<Pick<IMessage, 'expiredAt'>>(),
      Conversation.exists({
        ...owner, conversationId: scope.parentConversationId,
        ...activeExpirationFilter<IConversation>(),
      }),
      Conversation.exists({
        ...owner, conversationId: scope.conversationId,
        'subagentThread.parentConversationId': scope.parentConversationId,
        'subagentThreadLease.taskId': scope.taskId,
        'subagentThreadLease.expiresAt': { $gt: new Date() },
        ...(leaseToken == null ? {} : { 'subagentThreadLease.token': leaseToken }),
        ...activeExpirationFilter<IConversation>(),
      }),
    ]);
    if (seed == null || parent == null || child == null) {
      return { ok: false, error: { code: 'SUBAGENT_CONTENT_GONE' } };
    }
    const Model = contentModel();
    const digest = createHash('sha256').update(eventsJson).digest('hex');
    const fragments = Math.ceil(eventsJson.length / FRAGMENT_CHARS);
    const base = {
      ...scope, revision, fromSequence, throughSequence, digest, fragments,
      ...(seed.expiredAt == null ? {} : { expiredAt: seed.expiredAt }),
    };
    const recordId = (fragment: number) => createHash('sha256').update(JSON.stringify([
      scope.tenantId ?? null, scope.user, scope.conversationId, scope.taskId, revision, fragment,
    ])).digest('hex');
    const records = Array.from({ length: fragments }, (_, fragment) => ({
      updateOne: {
        filter: { _id: recordId(fragment), ...scopeFilter(scope), revision, fragment, digest },
        update: { $setOnInsert: {
          ...base, fragment,
          payload: eventsJson.slice(fragment * FRAGMENT_CHARS, (fragment + 1) * FRAGMENT_CHARS),
        } },
        upsert: true,
      },
    }));
    await tenantSafeBulkWrite(Model, records, { ordered: false });
    /** A retry can only commit identical bytes; conflicting retries hit the unique index. */
    await Model.updateOne(
      { _id: recordId(-1), ...scopeFilter(scope), revision, fragment: -1, digest },
      { $setOnInsert: { ...base, fragment: -1 } },
      { upsert: true },
    );
    const [seedStillPresent, parentStillPresent, childStillPresent] = await Promise.all([
      Message.exists(inputFilter),
      Conversation.exists({ ...owner, conversationId: scope.parentConversationId,
        ...activeExpirationFilter<IConversation>() }),
      Conversation.exists({ ...owner, conversationId: scope.conversationId,
        'subagentThread.parentConversationId': scope.parentConversationId,
        'subagentThreadLease.taskId': scope.taskId,
        'subagentThreadLease.expiresAt': { $gt: new Date() },
        ...(leaseToken == null ? {} : { 'subagentThreadLease.token': leaseToken }),
        ...activeExpirationFilter<IConversation>() }),
    ]);
    if (seedStillPresent == null || parentStillPresent == null || childStillPresent == null) {
      await Model.deleteMany(scopeFilter(scope));
      return { ok: false, error: { code: 'SUBAGENT_CONTENT_GONE' } };
    }
    return { ok: true };
  }

  async function getSubagentContentHead(
    scope: SubagentContentScope,
    throughRevision?: number,
  ): Promise<SubagentContentHead | null> {
    return contentModel().findOne({
      ...scopeFilter(scope), fragment: -1,
      ...(throughRevision == null ? {} : { revision: { $lte: throughRevision } }),
      ...activeExpirationFilter(),
    }).sort({ revision: -1 }).select('revision throughSequence -_id').lean<SubagentContentHead>();
  }

  async function* streamSubagentContentBatches(
    scope: SubagentContentScope,
    throughRevision: number,
    afterSequence = -1,
  ): AsyncGenerator<SubagentContentBatch> {
    const cursor = contentModel().find({
      ...scopeFilter(scope), revision: { $lte: throughRevision },
      throughSequence: { $gt: afterSequence }, ...activeExpirationFilter(),
    }).sort({ revision: 1, fragment: 1 }).lean().cursor();
    let commit: ISubagentContentChunk | undefined;
    let payloads: string[] = [];
    const decode = (): SubagentContentBatch => {
      if (commit == null || payloads.length !== commit.fragments) {
        throw new Error('Incomplete committed subagent content batch');
      }
      const eventsJson = payloads.join('');
      if (createHash('sha256').update(eventsJson).digest('hex') !== commit.digest) {
        throw new Error('Invalid committed subagent content digest');
      }
      return { revision: commit.revision, fromSequence: commit.fromSequence,
        throughSequence: commit.throughSequence, eventsJson };
    };
    try {
      for await (const row of cursor) {
        if (row.fragment === -1) {
          if (commit != null) yield decode();
          commit = row;
          payloads = [];
          continue;
        }
        if (commit == null || row.revision !== commit.revision ||
          row.fragment !== payloads.length || row.digest !== commit.digest ||
          typeof row.payload !== 'string') {
          throw new Error('Invalid committed subagent content fragment');
        }
        payloads.push(row.payload);
      }
      if (commit != null) yield decode();
    } finally {
      await cursor.close();
    }
  }

  return { appendSubagentContentBatch, getSubagentContentHead, streamSubagentContentBatches };
}

export type SubagentContentMethods = ReturnType<typeof createSubagentContentMethods>;
