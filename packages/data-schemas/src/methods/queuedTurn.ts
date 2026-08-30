import { createHash, randomUUID } from 'node:crypto';
import type { Model, Types } from 'mongoose';
import type {
  AgentQueuedTurnActiveRecord,
  AgentQueuedTurnClaim,
  AgentQueuedTurnFailure,
  AgentQueuedTurnFileRef,
  AgentQueuedTurnRecord,
  IAgentQueuedTurn,
  IAgentQueuedTurnDocument,
  IAgentQueuedTurnSequence,
  IAgentQueuedTurnSequenceDocument,
} from '~/types/queuedTurn';
import { createIndexesWithRetry } from '~/utils/retry';

const DUPLICATE_KEY = 11000;
const MAX_FILES = 20;
const MAX_QUOTES = 10;
const MAX_QUOTE_LENGTH = 1500;
const MAX_MANUAL_SKILLS = 32;
const MAX_TEXT_LENGTH = 32_768;
export const MAX_ACTIVE_AGENT_QUEUED_TURNS = 100;
const LANE_WRITER_LEASE_MS = 30_000;
const LANE_WRITER_RETRY_MS = 5;
const LANE_WRITER_RETRIES = LANE_WRITER_LEASE_MS / LANE_WRITER_RETRY_MS;

interface DuplicateKeyError {
  code?: number;
}

export class AgentQueuedTurnConflictError extends Error {
  constructor(clientRequestId: string) {
    super(`Agent queued turn idempotency conflict: ${clientRequestId}`);
    this.name = 'AgentQueuedTurnConflictError';
  }
}

export class AgentQueuedTurnCapacityError extends Error {
  constructor() {
    super(`Agent queued turn capacity is limited to ${MAX_ACTIVE_AGENT_QUEUED_TURNS}`);
    this.name = 'AgentQueuedTurnCapacityError';
  }
}

export class AgentQueuedTurnLaneRetiredError extends Error {
  constructor() {
    super('Agent queued turn conversation is being deleted');
    this.name = 'AgentQueuedTurnLaneRetiredError';
  }
}

export interface AgentQueuedTurnOwnerScope {
  user: Types.ObjectId;
  tenantId?: string;
}

export interface AgentQueuedTurnConversationScope extends AgentQueuedTurnOwnerScope {
  conversationId: string;
}

export interface AgentQueuedTurnDeletionTarget {
  conversationId: string;
  tenantId?: string;
  /** Recovery for a conversation row that was already deleted cannot recover
   * its tenant. User + conversation identity is still sufficient to purge it. */
  allTenants?: true;
}

export interface EnqueueAgentQueuedTurnInput extends AgentQueuedTurnConversationScope {
  agentId: string;
  parentMessageId: string;
  clientRequestId: string;
  text: string;
  files?: readonly AgentQueuedTurnFileRef[];
  quotes?: readonly string[];
  manualSkills?: readonly string[];
  expectedPredecessorCreatedAt?: number;
  priority?: boolean;
  availableAt?: Date;
}

export interface AgentQueuedTurnClaimFence extends AgentQueuedTurnConversationScope {
  queuedTurnId: string;
  claimId: string;
  claimBy: string;
}

export type CancelAgentQueuedTurnResult =
  | { outcome: 'cancelled' | 'already_cancelled'; turn: AgentQueuedTurnRecord }
  | { outcome: 'not_cancellable'; turn: AgentQueuedTurnRecord }
  | { outcome: 'not_found'; turn: null };

export type ReleaseAgentQueuedTurnResult =
  | { outcome: 'released' | 'dead'; turn: AgentQueuedTurnRecord }
  | { outcome: 'conflict'; turn: AgentQueuedTurnRecord | null };

export type AdmitAgentQueuedTurnResult =
  | { outcome: 'admitted' | 'already_admitted'; turn: AgentQueuedTurnRecord }
  | { outcome: 'conflict'; turn: AgentQueuedTurnRecord | null };

export type DeadLetterAgentQueuedTurnResult =
  | { outcome: 'dead' | 'already_terminal'; turn: AgentQueuedTurnRecord }
  | { outcome: 'missing'; turn: null }
  | { outcome: 'conflict'; turn: AgentQueuedTurnRecord };

export type ScheduleAgentQueuedTurnResult =
  | { outcome: 'scheduled' | 'already_scheduled'; turn: AgentQueuedTurnRecord }
  | { outcome: 'conflict'; turn: AgentQueuedTurnRecord | null };

export type ReserveAgentQueuedTurnDeliveryResult =
  | { outcome: 'reserved' | 'already_reserved'; turn: AgentQueuedTurnRecord }
  | { outcome: 'conflict'; turn: AgentQueuedTurnRecord | null };

export type ClaimAgentQueuedTurnResult =
  | { outcome: 'acquired' | 'replayed'; claim: AgentQueuedTurnClaim }
  | { outcome: 'blocked'; claim: null }
  | { outcome: 'missing'; claim: null };

export interface AgentQueuedTurnMethods {
  ensureAgentQueuedTurnIndexes: () => Promise<void>;
  enqueueAgentQueuedTurn: (
    input: EnqueueAgentQueuedTurnInput,
  ) => Promise<{ turn: AgentQueuedTurnRecord; replayed: boolean }>;
  getAgentQueuedTurnByClientRequestId: (
    input: AgentQueuedTurnConversationScope & { clientRequestId: string },
  ) => Promise<AgentQueuedTurnRecord | null>;
  listActiveAgentQueuedTurns: (
    input: AgentQueuedTurnConversationScope & { limit?: number },
  ) => Promise<AgentQueuedTurnActiveRecord[]>;
  listAgentQueuedTurnReceipts: (
    input: AgentQueuedTurnConversationScope & { clientRequestIds?: readonly string[] },
  ) => Promise<AgentQueuedTurnActiveRecord[]>;
  findQueuedTurnsNeedingDelivery: (limit?: number) => Promise<AgentQueuedTurnRecord[]>;
  reserveAgentQueuedTurnDelivery: (
    input: AgentQueuedTurnConversationScope & {
      queuedTurnId: string;
      deliveryKey: string;
    },
  ) => Promise<ReserveAgentQueuedTurnDeliveryResult>;
  markQueuedTurnScheduled: (
    input: AgentQueuedTurnConversationScope & {
      queuedTurnId: string;
      deliveryKey: string;
      scheduledAt?: Date;
    },
  ) => Promise<ScheduleAgentQueuedTurnResult>;
  cancelAgentQueuedTurn: (
    input: AgentQueuedTurnOwnerScope & {
      queuedTurnId: string;
      conversationId?: string;
      settledAt?: Date;
    },
  ) => Promise<CancelAgentQueuedTurnResult>;
  claimNextAgentQueuedTurn: (
    input: AgentQueuedTurnConversationScope & {
      queuedTurnId: string;
      claimId: string;
      claimBy: string;
      now: Date;
      leaseUntil: Date;
    },
  ) => Promise<ClaimAgentQueuedTurnResult>;
  releaseAgentQueuedTurn: (
    input: AgentQueuedTurnClaimFence &
      (
        | { disposition: 'retry'; availableAt: Date }
        | {
            disposition: 'dead';
            settledAt: Date;
            failure: AgentQueuedTurnFailure;
          }
      ),
  ) => Promise<ReleaseAgentQueuedTurnResult>;
  markAgentQueuedTurnAdmitted: (
    input: AgentQueuedTurnClaimFence & {
      admissionId: string;
      admissionMode: 'warm' | 'ordinary';
      generationId?: string;
      generationCreatedAt?: number;
      settledAt: Date;
    },
  ) => Promise<AdmitAgentQueuedTurnResult>;
  deadLetterAgentQueuedTurn: (
    input: AgentQueuedTurnConversationScope & {
      queuedTurnId: string;
      deliveryKey: string;
      settledAt: Date;
      failure: AgentQueuedTurnFailure;
    },
  ) => Promise<DeadLetterAgentQueuedTurnResult>;
  getEffectiveAgentQueuedTurnPredecessor: (
    input: AgentQueuedTurnConversationScope & {
      sequence: number;
      expectedPredecessorCreatedAt?: number;
    },
  ) => Promise<number | undefined>;
  drainAgentQueuedTurns: (
    input: AgentQueuedTurnOwnerScope & {
      conversationId?: string;
      settledAt?: Date;
    },
  ) => Promise<number>;
  deleteAgentQueuedTurns: (
    input: AgentQueuedTurnOwnerScope & { conversationId?: string },
  ) => Promise<number>;
  prepareAgentQueuedTurnConversationDeletion: (input: {
    user: Types.ObjectId;
    targets: readonly AgentQueuedTurnDeletionTarget[];
    settledAt?: Date;
  }) => Promise<string[]>;
  deletePreparedAgentQueuedTurnConversations: (input: {
    user: Types.ObjectId;
    targets: readonly AgentQueuedTurnDeletionTarget[];
  }) => Promise<number>;
  markAgentQueuedTurnDeliveryRetired: (input: { deliveryKey: string }) => Promise<boolean>;
  deleteAllAgentQueuedTurnsForUser: (input: { user: Types.ObjectId }) => Promise<number>;
}

function tenantScope(tenantId: string | undefined):
  | { tenantId: string }
  | {
      tenantId: { $exists: false };
    } {
  return tenantId == null ? { tenantId: { $exists: false } } : { tenantId };
}

function ownerScope(input: AgentQueuedTurnOwnerScope) {
  return { user: input.user, ...tenantScope(input.tenantId) };
}

function ownerFields(input: AgentQueuedTurnOwnerScope) {
  return {
    user: input.user,
    ...(input.tenantId != null && { tenantId: input.tenantId }),
  };
}

function conversationScope(input: AgentQueuedTurnConversationScope) {
  return {
    ...ownerScope(input),
    conversationId: requireBoundedString(input.conversationId, 256),
  };
}

function conversationFields(input: AgentQueuedTurnConversationScope) {
  return {
    ...ownerFields(input),
    conversationId: requireBoundedString(input.conversationId, 256),
  };
}

function deletionScope(input: {
  user: Types.ObjectId;
  targets: readonly AgentQueuedTurnDeletionTarget[];
}) {
  const targets = input.targets.map((target) => {
    const conversationId = requireBoundedString(target.conversationId, 256);
    if (target.allTenants === true) {
      return { conversationId };
    }
    return { conversationId, ...tenantScope(target.tenantId) };
  });
  if (targets.length === 0) {
    throw new TypeError('Agent queued turn deletion requires at least one conversation');
  }
  return { user: input.user, $or: targets };
}

function requireBoundedString(value: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new TypeError('Agent queued turn value must be a string');
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new TypeError('Agent queued turn value has an invalid length');
  }
  return normalized;
}

function normalizeOptionalString(value: string | undefined, maxLength: number): string | undefined {
  if (value == null) {
    return undefined;
  }
  return requireBoundedString(value, maxLength);
}

function normalizeFiles(files: readonly AgentQueuedTurnFileRef[] | undefined) {
  if (files == null || files.length === 0) {
    return undefined;
  }
  if (files.length > MAX_FILES) {
    throw new TypeError('Agent queued turn has too many files');
  }
  const seen = new Set<string>();
  const normalized: AgentQueuedTurnFileRef[] = [];
  for (const file of files) {
    const fileId = requireBoundedString(file.file_id, 256);
    if (seen.has(fileId)) {
      continue;
    }
    seen.add(fileId);
    normalized.push({
      file_id: fileId,
      ...(normalizeOptionalString(file.type, 256) != null && {
        type: normalizeOptionalString(file.type, 256),
      }),
      ...(normalizeOptionalString(file.filepath, 2048) != null && {
        filepath: normalizeOptionalString(file.filepath, 2048),
      }),
      ...(normalizeOptionalString(file.filename, 1024) != null && {
        filename: normalizeOptionalString(file.filename, 1024),
      }),
      ...(file.height != null && {
        height: requireNonnegativeNumber(file.height),
      }),
      ...(file.width != null && {
        width: requireNonnegativeNumber(file.width),
      }),
      ...(file.bytes != null && {
        bytes: requireNonnegativeNumber(file.bytes),
      }),
    });
  }
  return normalized.length === 0 ? undefined : normalized;
}

function requireNonnegativeNumber(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError('Agent queued turn file metadata must be nonnegative');
  }
  return value;
}

function normalizeQuotes(quotes: readonly string[] | undefined) {
  if (quotes == null || quotes.length === 0) {
    return undefined;
  }
  const normalized: string[] = [];
  for (const quote of quotes) {
    if (typeof quote !== 'string') {
      throw new TypeError('Agent queued turn quote must be a string');
    }
    const trimmed = quote.trim();
    if (trimmed.length === 0) {
      continue;
    }
    normalized.push(trimmed.slice(0, MAX_QUOTE_LENGTH));
    if (normalized.length >= MAX_QUOTES) {
      break;
    }
  }
  return normalized.length === 0 ? undefined : normalized;
}

function normalizeManualSkills(manualSkills: readonly string[] | undefined) {
  if (manualSkills == null || manualSkills.length === 0) {
    return undefined;
  }
  if (manualSkills.length > MAX_MANUAL_SKILLS) {
    throw new TypeError('Agent queued turn has too many manual skills');
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const skill of manualSkills) {
    const name = requireBoundedString(skill, 256);
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    normalized.push(name);
  }
  return normalized.length === 0 ? undefined : normalized;
}

function normalizeText(text: string): string {
  if (typeof text !== 'string') {
    throw new TypeError('Agent queued turn text must be a string');
  }
  const normalized = text.trim();
  if (normalized.length > MAX_TEXT_LENGTH) {
    throw new TypeError('Agent queued turn text is too long');
  }
  return normalized;
}

function normalizePredecessor(value: number | undefined): number | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('Agent queued turn predecessor epoch must be a nonnegative integer');
  }
  return value;
}

function normalizeEnqueue(input: EnqueueAgentQueuedTurnInput) {
  const normalized = {
    agentId: requireBoundedString(input.agentId, 256),
    parentMessageId: requireBoundedString(input.parentMessageId, 256),
    clientRequestId: requireBoundedString(input.clientRequestId, 128),
    text: normalizeText(input.text),
    files: normalizeFiles(input.files),
    quotes: normalizeQuotes(input.quotes),
    manualSkills: normalizeManualSkills(input.manualSkills),
    expectedPredecessorCreatedAt: normalizePredecessor(input.expectedPredecessorCreatedAt),
    priority: input.priority === true,
  };
  if (normalized.text.length === 0 && normalized.files == null && normalized.quotes == null) {
    throw new TypeError('Agent queued turn must contain text, a file, or a quote');
  }
  return normalized;
}

function fingerprint(payload: ReturnType<typeof normalizeEnqueue>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('base64url');
}

function laneKey(input: AgentQueuedTurnConversationScope): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        input.tenantId ?? null,
        input.user.toString(),
        requireBoundedString(input.conversationId, 256),
      ]),
    )
    .digest('base64url');
}

function effectiveDeliveryState(turn: IAgentQueuedTurn) {
  if (turn.deliveryState != null) {
    return turn.deliveryState;
  }
  if (turn.deliveryKey == null) {
    return 'pending' as const;
  }
  if (turn.scheduledAt == null) {
    return 'publishing' as const;
  }
  return 'published' as const;
}

function toRecord(turn: IAgentQueuedTurn): AgentQueuedTurnRecord {
  if (
    turn._id == null ||
    turn.createdAt == null ||
    turn.sequence == null ||
    turn.status === 'reserving'
  ) {
    throw new Error('Agent queued turn is missing its durable identity');
  }
  return {
    queuedTurnId: turn._id.toString(),
    user: turn.user,
    ...(turn.tenantId != null && { tenantId: turn.tenantId }),
    conversationId: turn.conversationId,
    agentId: turn.agentId,
    parentMessageId: turn.parentMessageId,
    clientRequestId: turn.clientRequestId,
    fingerprint: turn.fingerprint,
    sequence: turn.sequence,
    ...(turn.activeSlot != null && { activeSlot: turn.activeSlot }),
    status: turn.status,
    priority: turn.priority,
    text: turn.text,
    ...(turn.files != null && { files: turn.files }),
    ...(turn.quotes != null && { quotes: turn.quotes }),
    ...(turn.manualSkills != null && { manualSkills: turn.manualSkills }),
    ...(turn.expectedPredecessorCreatedAt != null && {
      expectedPredecessorCreatedAt: turn.expectedPredecessorCreatedAt,
    }),
    attempts: turn.attempts,
    availableAt: turn.availableAt,
    ...(turn.deliveryKey != null && { deliveryKey: turn.deliveryKey }),
    deliveryState: effectiveDeliveryState(turn),
    ...(turn.scheduledAt != null && { scheduledAt: turn.scheduledAt }),
    ...(turn.claimId != null && { claimId: turn.claimId }),
    ...(turn.claimBy != null && { claimBy: turn.claimBy }),
    ...(turn.claimUntil != null && { claimUntil: turn.claimUntil }),
    ...(turn.terminalReceipt != null && {
      terminalReceipt: turn.terminalReceipt,
    }),
    createdAt: turn.createdAt,
    ...(turn.updatedAt != null && { updatedAt: turn.updatedAt }),
  };
}

function toActiveRecord(turn: IAgentQueuedTurn): AgentQueuedTurnActiveRecord {
  const record = toRecord(turn);
  return {
    queuedTurnId: record.queuedTurnId,
    conversationId: record.conversationId,
    agentId: record.agentId,
    parentMessageId: record.parentMessageId,
    clientRequestId: record.clientRequestId,
    sequence: record.sequence,
    ...(record.activeSlot != null && { activeSlot: record.activeSlot }),
    status: record.status,
    priority: record.priority,
    text: record.text,
    ...(record.files != null && { files: record.files }),
    ...(record.quotes != null && { quotes: record.quotes }),
    ...(record.manualSkills != null && { manualSkills: record.manualSkills }),
    ...(record.expectedPredecessorCreatedAt != null && {
      expectedPredecessorCreatedAt: record.expectedPredecessorCreatedAt,
    }),
    attempts: record.attempts,
    availableAt: record.availableAt,
    ...(record.deliveryKey != null && { deliveryKey: record.deliveryKey }),
    ...(record.deliveryState != null && { deliveryState: record.deliveryState }),
    ...(record.scheduledAt != null && { scheduledAt: record.scheduledAt }),
    createdAt: record.createdAt,
    ...(record.updatedAt != null && { updatedAt: record.updatedAt }),
    ...(record.terminalReceipt != null && { terminalReceipt: record.terminalReceipt }),
  };
}

function requireClaim(turn: IAgentQueuedTurn | null): AgentQueuedTurnClaim | null {
  if (
    turn == null ||
    turn.status !== 'claimed' ||
    turn.claimId == null ||
    turn.claimBy == null ||
    turn.claimUntil == null
  ) {
    return null;
  }
  return toRecord(turn) as AgentQueuedTurnClaim;
}

export function createAgentQueuedTurnMethods(
  mongoose: typeof import('mongoose'),
): AgentQueuedTurnMethods {
  const Turn = () => mongoose.models.AgentQueuedTurn as Model<IAgentQueuedTurnDocument>;
  const Sequence = () =>
    mongoose.models.AgentQueuedTurnSequence as Model<IAgentQueuedTurnSequenceDocument>;

  async function ensureAgentQueuedTurnIndexes(): Promise<void> {
    await Promise.all([createIndexesWithRetry(Turn()), createIndexesWithRetry(Sequence())]);
  }

  async function ensureSequenceLane(
    input: AgentQueuedTurnConversationScope,
  ): Promise<IAgentQueuedTurnSequence> {
    const _id = laneKey(input);
    try {
      const lane = await Sequence()
        .findOneAndUpdate(
          { _id, ...conversationScope(input) },
          { $setOnInsert: { ...conversationFields(input), value: 0 } },
          { new: true, upsert: true },
        )
        .lean<IAgentQueuedTurnSequence>();
      if (lane != null) {
        return lane;
      }
    } catch (error) {
      if ((error as DuplicateKeyError).code !== DUPLICATE_KEY) {
        throw error;
      }
    }
    throw new Error('Agent queued turn sequence scope conflict');
  }

  async function acquireLaneWriter(input: AgentQueuedTurnConversationScope): Promise<string> {
    const _id = laneKey(input);
    const scope = conversationScope(input);
    const writerId = randomUUID();
    for (let attempt = 0; attempt < LANE_WRITER_RETRIES; attempt++) {
      const now = new Date();
      const lane = await Sequence()
        .findOneAndUpdate(
          {
            _id,
            ...scope,
            retiredAt: { $exists: false },
            $or: [{ writerId: { $exists: false } }, { writerUntil: { $lte: now } }],
          },
          {
            $set: {
              writerId,
              writerUntil: new Date(now.getTime() + LANE_WRITER_LEASE_MS),
            },
            $setOnInsert: { ...conversationFields(input), value: 0 },
          },
          { new: true, upsert: true },
        )
        .lean<IAgentQueuedTurnSequence>()
        .catch((error: unknown) => {
          if ((error as DuplicateKeyError).code === DUPLICATE_KEY) {
            return null;
          }
          throw error;
        });
      if (lane?.writerId === writerId) {
        return writerId;
      }
      const retired = await Sequence().exists({ _id, ...scope, retiredAt: { $exists: true } });
      if (retired != null) {
        throw new AgentQueuedTurnLaneRetiredError();
      }
      await new Promise((resolve) => setTimeout(resolve, LANE_WRITER_RETRY_MS));
    }
    throw new Error('Agent queued turn lane writer lease did not become available');
  }

  async function releaseLaneWriter(
    input: AgentQueuedTurnConversationScope,
    writerId: string,
  ): Promise<void> {
    await Sequence().updateOne(
      { _id: laneKey(input), ...conversationScope(input), writerId },
      { $unset: { writerId: 1, writerUntil: 1 } },
    );
  }

  async function repairLaneReservation(input: AgentQueuedTurnConversationScope): Promise<void> {
    const _id = laneKey(input);
    const scope = conversationScope(input);
    const lane = await ensureSequenceLane(input);
    if (lane.reservationId != null) {
      await Turn().updateOne(
        {
          ...scope,
          _id: lane.reservationId,
          status: 'reserving',
          sequence: { $exists: false },
        },
        { $set: { status: 'queued', sequence: lane.value } },
      );
      await Sequence().updateOne(
        { _id, ...scope, reservationId: lane.reservationId },
        { $unset: { reservationId: 1 } },
      );
      return;
    }
    const head = await Turn()
      .findOne({ ...scope, status: 'reserving', sequence: { $exists: false } })
      .sort({ createdAt: 1, _id: 1 })
      .lean<IAgentQueuedTurn>();
    if (head?._id == null) {
      return;
    }
    const reservationId = head._id.toString();
    const claimed = await Sequence()
      .findOneAndUpdate(
        { _id, ...scope, reservationId: { $exists: false } },
        { $inc: { value: 1 }, $set: { reservationId } },
        { new: true },
      )
      .lean<IAgentQueuedTurnSequence>();
    if (claimed == null) {
      return;
    }
    const assigned = await Turn().updateOne(
      { ...scope, _id: reservationId, status: 'reserving', sequence: { $exists: false } },
      { $set: { status: 'queued', sequence: claimed.value } },
    );
    await Sequence().updateOne(
      { _id, ...scope, reservationId, value: claimed.value },
      assigned.modifiedCount === 1
        ? { $unset: { reservationId: 1 } }
        : { $inc: { value: -1 }, $unset: { reservationId: 1 } },
    );
  }

  /** Finish reservations oldest-first. The lane record durably names the row
   * that owns its next value, so another process can complete either half. */
  async function finalizeVisibleReservation(
    target: IAgentQueuedTurn,
  ): Promise<AgentQueuedTurnRecord> {
    if (target._id == null) {
      throw new Error('Agent queued turn reservation is missing its durable identity');
    }
    const scopeInput: AgentQueuedTurnConversationScope = {
      user: target.user,
      ...(target.tenantId != null && { tenantId: target.tenantId }),
      conversationId: target.conversationId,
    };
    const scope = conversationScope(scopeInput);
    const targetId = target._id.toString();
    for (let repair = 0; repair <= MAX_ACTIVE_AGENT_QUEUED_TURNS; repair++) {
      await repairLaneReservation(scopeInput);
      const current = await Turn()
        .findOne({ ...scope, _id: targetId })
        .lean<IAgentQueuedTurn>();
      if (current == null) {
        throw new Error('Agent queued turn reservation disappeared');
      }
      if (current.status !== 'reserving') {
        return toRecord(current);
      }
    }
    throw new Error('Agent queued turn reservation repair exceeded lane capacity');
  }

  async function enqueueAgentQueuedTurn(
    input: EnqueueAgentQueuedTurnInput,
  ): Promise<{ turn: AgentQueuedTurnRecord; replayed: boolean }> {
    const scope = conversationScope(input);
    const normalized = normalizeEnqueue(input);
    const requestFingerprint = fingerprint(normalized);
    const existing = await Turn()
      .findOne({ ...scope, clientRequestId: normalized.clientRequestId })
      .lean<IAgentQueuedTurn>();
    if (existing != null) {
      if (existing.fingerprint !== requestFingerprint) {
        throw new AgentQueuedTurnConflictError(normalized.clientRequestId);
      }
      if (existing.status !== 'reserving') {
        return { turn: toRecord(existing), replayed: true };
      }
    }

    const writerId = await acquireLaneWriter(input);
    try {
      const replay = await Turn()
        .findOne({ ...scope, clientRequestId: normalized.clientRequestId })
        .lean<IAgentQueuedTurn>();
      if (replay != null) {
        if (replay.fingerprint !== requestFingerprint) {
          throw new AgentQueuedTurnConflictError(normalized.clientRequestId);
        }
        return {
          turn:
            replay.status === 'reserving'
              ? await finalizeVisibleReservation(replay)
              : toRecord(replay),
          replayed: true,
        };
      }

      const firstSlot =
        createHash('sha256').update(normalized.clientRequestId).digest().readUInt32BE(0) %
        MAX_ACTIVE_AGENT_QUEUED_TURNS;
      const usedSlots = new Set(
        (await Turn().distinct('activeSlot', {
          ...scope,
          activeSlot: { $exists: true },
        })) as number[],
      );
      for (let offset = 0; offset < MAX_ACTIVE_AGENT_QUEUED_TURNS; offset++) {
        const activeSlot = (firstSlot + offset) % MAX_ACTIVE_AGENT_QUEUED_TURNS;
        if (usedSlots.has(activeSlot)) {
          continue;
        }
        try {
          const created = await Turn().create({
            ...conversationFields(input),
            ...normalized,
            fingerprint: requestFingerprint,
            activeSlot,
            status: 'reserving',
            attempts: 0,
            availableAt: input.availableAt ?? new Date(),
            deliveryState: 'pending',
          });
          return { turn: await finalizeVisibleReservation(created.toObject()), replayed: false };
        } catch (error) {
          if ((error as DuplicateKeyError).code !== DUPLICATE_KEY) {
            throw error;
          }
          usedSlots.add(activeSlot);
          const racedReplay = await Turn()
            .findOne({ ...scope, clientRequestId: normalized.clientRequestId })
            .lean<IAgentQueuedTurn>();
          if (racedReplay != null) {
            if (racedReplay.fingerprint !== requestFingerprint) {
              throw new AgentQueuedTurnConflictError(normalized.clientRequestId);
            }
            return {
              turn:
                racedReplay.status === 'reserving'
                  ? await finalizeVisibleReservation(racedReplay)
                  : toRecord(racedReplay),
              replayed: true,
            };
          }
        }
      }
      throw new AgentQueuedTurnCapacityError();
    } finally {
      await releaseLaneWriter(input, writerId);
    }
  }

  async function listActiveAgentQueuedTurns(
    input: AgentQueuedTurnConversationScope & { limit?: number },
  ): Promise<AgentQueuedTurnActiveRecord[]> {
    const limit = input.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 100) {
      throw new TypeError('Agent queued turn list limit must be between 1 and 100');
    }
    const turns = await Turn()
      .find({
        ...conversationScope(input),
        status: { $in: ['queued', 'claimed'] },
      })
      .sort({ priority: -1, sequence: 1 })
      .limit(limit)
      .lean<IAgentQueuedTurn[]>();
    return turns.map(toActiveRecord);
  }

  async function listAgentQueuedTurnReceipts(
    input: AgentQueuedTurnConversationScope & { clientRequestIds?: readonly string[] },
  ): Promise<AgentQueuedTurnActiveRecord[]> {
    const clientRequestIds = [
      ...new Set((input.clientRequestIds ?? []).map((value) => requireBoundedString(value, 128))),
    ];
    if (clientRequestIds.length > MAX_ACTIVE_AGENT_QUEUED_TURNS) {
      throw new TypeError(
        `Agent queued turn receipt lookup is limited to ${MAX_ACTIVE_AGENT_QUEUED_TURNS} ids`,
      );
    }
    const scope = conversationScope(input);
    const [active, dead, known] = await Promise.all([
      Turn()
        .find({ ...scope, status: { $in: ['queued', 'claimed'] } })
        .sort({ priority: -1, sequence: 1 })
        .limit(MAX_ACTIVE_AGENT_QUEUED_TURNS)
        .lean<IAgentQueuedTurn[]>(),
      Turn()
        .find({ ...scope, status: 'dead' })
        .sort({ sequence: -1 })
        .limit(MAX_ACTIVE_AGENT_QUEUED_TURNS)
        .lean<IAgentQueuedTurn[]>(),
      clientRequestIds.length === 0
        ? Promise.resolve([])
        : Turn()
            .find({ ...scope, clientRequestId: { $in: clientRequestIds } })
            .limit(clientRequestIds.length)
            .lean<IAgentQueuedTurn[]>(),
    ]);
    const turns = new Map<string, IAgentQueuedTurn>();
    for (const turn of [...active, ...dead, ...known]) {
      if (turn._id != null) {
        turns.set(turn._id.toString(), turn);
      }
    }
    return [...turns.values()]
      .filter((turn) => turn.sequence != null)
      .sort(
        (left, right) =>
          Number(right.priority) - Number(left.priority) ||
          (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER),
      )
      .map(toActiveRecord);
  }

  async function getAgentQueuedTurnByClientRequestId(
    input: AgentQueuedTurnConversationScope & { clientRequestId: string },
  ): Promise<AgentQueuedTurnRecord | null> {
    const turn = await Turn()
      .findOne({
        ...conversationScope(input),
        clientRequestId: requireBoundedString(input.clientRequestId, 128),
      })
      .lean<IAgentQueuedTurn>();
    return turn == null ? null : toRecord(turn);
  }

  async function cancelAgentQueuedTurn(
    input: AgentQueuedTurnOwnerScope & {
      queuedTurnId: string;
      conversationId?: string;
      settledAt?: Date;
    },
  ): Promise<CancelAgentQueuedTurnResult> {
    const settledAt = input.settledAt ?? new Date();
    const scope = {
      ...ownerScope(input),
      ...(input.conversationId != null && {
        conversationId: requireBoundedString(input.conversationId, 256),
      }),
    };
    const turn = await Turn()
      .findOneAndUpdate(
        {
          ...scope,
          _id: input.queuedTurnId,
          status: { $in: ['queued', 'dead'] },
        },
        {
          $set: {
            status: 'cancelled',
            terminalReceipt: { outcome: 'cancelled', settledAt },
          },
          $unset: { activeSlot: 1, claimId: 1, claimBy: 1, claimUntil: 1 },
        },
        { new: true },
      )
      .lean<IAgentQueuedTurn>();
    if (turn != null) {
      const deliveryState =
        turn.deliveryKey == null ? 'retired' : (turn.deliveryState ?? 'published');
      const state = await Turn()
        .findOneAndUpdate(
          {
            _id: turn._id,
            status: 'cancelled',
            ...(turn.deliveryKey == null && { deliveryKey: { $exists: false } }),
          },
          { $set: { deliveryState } },
          { new: true },
        )
        .lean<IAgentQueuedTurn>();
      return { outcome: 'cancelled', turn: toRecord(state ?? turn) };
    }
    const current = await Turn()
      .findOne({ ...scope, _id: input.queuedTurnId })
      .lean<IAgentQueuedTurn>();
    if (current == null) {
      return { outcome: 'not_found', turn: null };
    }
    if (current.status === 'cancelled') {
      return { outcome: 'already_cancelled', turn: toRecord(current) };
    }
    return { outcome: 'not_cancellable', turn: toRecord(current) };
  }

  async function findQueuedTurnsNeedingDelivery(limit = 100): Promise<AgentQueuedTurnRecord[]> {
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 1000) {
      throw new TypeError('Agent queued turn recovery limit must be between 1 and 1000');
    }
    const reservations = await Turn()
      .find({ status: 'reserving' })
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit)
      .lean<IAgentQueuedTurn[]>();
    for (const reservation of reservations) {
      await finalizeVisibleReservation(reservation);
    }
    const turns = await Turn()
      .find({
        $or: [
          {
            status: 'queued',
            $or: [
              { deliveryState: { $in: ['pending', 'publishing'] } },
              { deliveryState: { $exists: false }, scheduledAt: { $exists: false } },
            ],
          },
          { status: { $in: ['cancelled', 'dead'] }, deliveryState: 'publishing' },
          {
            status: { $in: ['cancelled', 'dead'] },
            deliveryKey: { $exists: true },
            deliveryState: { $exists: false },
          },
        ],
      })
      .sort({ availableAt: 1, sequence: 1, _id: 1 })
      .limit(limit)
      .lean<IAgentQueuedTurn[]>();
    return turns.map(toRecord);
  }

  async function reserveAgentQueuedTurnDelivery(
    input: AgentQueuedTurnConversationScope & {
      queuedTurnId: string;
      deliveryKey: string;
    },
  ): Promise<ReserveAgentQueuedTurnDeliveryResult> {
    const scope = conversationScope(input);
    const deliveryKey = requireBoundedString(input.deliveryKey, 128);
    const turn = await Turn()
      .findOneAndUpdate(
        {
          ...scope,
          _id: input.queuedTurnId,
          status: { $in: ['queued', 'claimed'] },
          $or: [{ deliveryState: 'pending' }, { deliveryState: { $exists: false } }],
          deliveryKey: { $exists: false },
        },
        { $set: { deliveryKey, deliveryState: 'publishing' } },
        { new: true },
      )
      .lean<IAgentQueuedTurn>();
    if (turn != null) {
      return { outcome: 'reserved', turn: toRecord(turn) };
    }
    const current = await Turn()
      .findOne({ ...scope, _id: input.queuedTurnId })
      .lean<IAgentQueuedTurn>();
    if (
      current?.deliveryKey === deliveryKey &&
      (current.deliveryState == null ||
        current.deliveryState === 'publishing' ||
        current.deliveryState === 'published')
    ) {
      return { outcome: 'already_reserved', turn: toRecord(current) };
    }
    return { outcome: 'conflict', turn: current == null ? null : toRecord(current) };
  }

  async function markQueuedTurnScheduled(
    input: AgentQueuedTurnConversationScope & {
      queuedTurnId: string;
      deliveryKey: string;
      scheduledAt?: Date;
    },
  ): Promise<ScheduleAgentQueuedTurnResult> {
    const deliveryKey = requireBoundedString(input.deliveryKey, 128);
    const turn = await Turn()
      .findOneAndUpdate(
        {
          ...conversationScope(input),
          _id: input.queuedTurnId,
          deliveryKey,
          $or: [{ deliveryState: 'publishing' }, { deliveryState: { $exists: false } }],
          scheduledAt: { $exists: false },
        },
        {
          $set: {
            scheduledAt: input.scheduledAt ?? new Date(),
            deliveryState: 'published',
          },
        },
        { new: true },
      )
      .lean<IAgentQueuedTurn>();
    if (turn != null) {
      return { outcome: 'scheduled', turn: toRecord(turn) };
    }
    const current = await Turn()
      .findOne({ ...conversationScope(input), _id: input.queuedTurnId })
      .lean<IAgentQueuedTurn>();
    if (
      current?.scheduledAt != null &&
      current.deliveryKey === deliveryKey &&
      current.deliveryState === 'published'
    ) {
      return { outcome: 'already_scheduled', turn: toRecord(current) };
    }
    return {
      outcome: 'conflict',
      turn: current == null ? null : toRecord(current),
    };
  }

  async function claimNextAgentQueuedTurn(
    input: AgentQueuedTurnConversationScope & {
      queuedTurnId: string;
      claimId: string;
      claimBy: string;
      now: Date;
      leaseUntil: Date;
    },
  ): Promise<ClaimAgentQueuedTurnResult> {
    const claimId = requireBoundedString(input.claimId, 128);
    const claimBy = requireBoundedString(input.claimBy, 256);
    if (input.leaseUntil.getTime() <= input.now.getTime()) {
      throw new TypeError('Agent queued turn lease must end after claim time');
    }
    const scope = conversationScope(input);
    const replay = await Turn()
      .findOne({
        ...scope,
        _id: input.queuedTurnId,
        status: 'claimed',
        claimId,
        claimBy,
        claimUntil: { $gt: input.now },
      })
      .lean<IAgentQueuedTurn>();
    const replayedClaim = requireClaim(replay);
    if (replayedClaim != null) {
      return { outcome: 'replayed', claim: replayedClaim };
    }

    const expected = await Turn()
      .findOne({ ...scope, _id: input.queuedTurnId })
      .lean<IAgentQueuedTurn>();
    if (expected == null || (expected.status !== 'queued' && expected.status !== 'claimed')) {
      return { outcome: 'missing', claim: null };
    }

    const unfinishedReservation = await Turn().exists({ ...scope, status: 'reserving' });
    if (unfinishedReservation != null) {
      return { outcome: 'blocked', claim: null };
    }

    const head = await Turn()
      .findOne({ ...scope, status: { $in: ['queued', 'claimed', 'dead'] } })
      .sort({ priority: -1, sequence: 1 })
      .lean<IAgentQueuedTurn>();
    if (head == null) {
      return { outcome: 'blocked', claim: null };
    }
    if (
      head._id?.toString() !== input.queuedTurnId ||
      head.availableAt.getTime() > input.now.getTime() ||
      (head.status === 'claimed' &&
        head.claimUntil != null &&
        head.claimUntil.getTime() > input.now.getTime())
    ) {
      return { outcome: 'blocked', claim: null };
    }

    const turn = await Turn()
      .findOneAndUpdate(
        {
          ...scope,
          _id: input.queuedTurnId,
          availableAt: { $lte: input.now },
          $or: [{ status: 'queued' }, { status: 'claimed', claimUntil: { $lte: input.now } }],
        },
        {
          $set: {
            status: 'claimed',
            claimId,
            claimBy,
            claimUntil: input.leaseUntil,
          },
          $inc: { attempts: 1 },
          $unset: { terminalReceipt: 1 },
        },
        { new: true, sort: { priority: -1, sequence: 1 } },
      )
      .lean<IAgentQueuedTurn>();
    const acquired = requireClaim(turn);
    if (acquired != null) {
      return { outcome: 'acquired', claim: acquired };
    }
    const racedReplay = await Turn()
      .findOne({
        ...scope,
        _id: input.queuedTurnId,
        status: 'claimed',
        claimId,
        claimBy,
        claimUntil: { $gt: input.now },
      })
      .lean<IAgentQueuedTurn>();
    const racedClaim = requireClaim(racedReplay);
    return racedClaim == null
      ? { outcome: 'blocked', claim: null }
      : { outcome: 'replayed', claim: racedClaim };
  }

  async function releaseAgentQueuedTurn(
    input: AgentQueuedTurnClaimFence &
      (
        | { disposition: 'retry'; availableAt: Date }
        | {
            disposition: 'dead';
            settledAt: Date;
            failure: AgentQueuedTurnFailure;
          }
      ),
  ): Promise<ReleaseAgentQueuedTurnResult> {
    const fence = {
      ...conversationScope(input),
      _id: input.queuedTurnId,
      status: 'claimed',
      claimId: requireBoundedString(input.claimId, 128),
      claimBy: requireBoundedString(input.claimBy, 256),
    };
    const update =
      input.disposition === 'retry'
        ? {
            $set: { status: 'queued', availableAt: input.availableAt },
            $unset: {
              claimId: 1,
              claimBy: 1,
              claimUntil: 1,
              terminalReceipt: 1,
            },
          }
        : {
            $set: {
              status: 'dead',
              terminalReceipt: {
                outcome: 'dead',
                settledAt: input.settledAt,
                failure: {
                  code: requireBoundedString(input.failure.code, 128),
                  message: requireBoundedString(input.failure.message, 2048),
                },
              },
            },
            $unset: { activeSlot: 1, claimId: 1, claimBy: 1, claimUntil: 1 },
          };
    const turn = await Turn()
      .findOneAndUpdate(fence, update, { new: true })
      .lean<IAgentQueuedTurn>();
    if (turn != null) {
      return {
        outcome: input.disposition === 'retry' ? 'released' : 'dead',
        turn: toRecord(turn),
      };
    }
    const current = await Turn()
      .findOne({ ...conversationScope(input), _id: input.queuedTurnId })
      .lean<IAgentQueuedTurn>();
    return {
      outcome: 'conflict',
      turn: current == null ? null : toRecord(current),
    };
  }

  async function markAgentQueuedTurnAdmitted(
    input: AgentQueuedTurnClaimFence & {
      admissionId: string;
      admissionMode: 'warm' | 'ordinary';
      generationId?: string;
      generationCreatedAt?: number;
      settledAt: Date;
    },
  ): Promise<AdmitAgentQueuedTurnResult> {
    const admissionId = requireBoundedString(input.admissionId, 128);
    const generationId = normalizeOptionalString(input.generationId, 256);
    const generationCreatedAt = normalizePredecessor(input.generationCreatedAt);
    const turn = await Turn()
      .findOneAndUpdate(
        {
          ...conversationScope(input),
          _id: input.queuedTurnId,
          status: 'claimed',
          claimId: requireBoundedString(input.claimId, 128),
          claimBy: requireBoundedString(input.claimBy, 256),
        },
        {
          $set: {
            status: 'admitted',
            deliveryState: 'retired',
            terminalReceipt: {
              outcome: 'admitted',
              settledAt: input.settledAt,
              admissionId,
              admissionMode: input.admissionMode,
              ...(generationId != null && { generationId }),
              ...(generationCreatedAt != null && { generationCreatedAt }),
            },
          },
          $unset: { activeSlot: 1, claimId: 1, claimBy: 1, claimUntil: 1 },
        },
        { new: true },
      )
      .lean<IAgentQueuedTurn>();
    if (turn != null) {
      return { outcome: 'admitted', turn: toRecord(turn) };
    }
    const current = await Turn()
      .findOne({ ...conversationScope(input), _id: input.queuedTurnId })
      .lean<IAgentQueuedTurn>();
    if (
      current?.status === 'admitted' &&
      current.terminalReceipt?.outcome === 'admitted' &&
      current.terminalReceipt.admissionId === admissionId
    ) {
      return { outcome: 'already_admitted', turn: toRecord(current) };
    }
    return {
      outcome: 'conflict',
      turn: current == null ? null : toRecord(current),
    };
  }

  async function deadLetterAgentQueuedTurn(
    input: AgentQueuedTurnConversationScope & {
      queuedTurnId: string;
      deliveryKey: string;
      settledAt: Date;
      failure: AgentQueuedTurnFailure;
    },
  ): Promise<DeadLetterAgentQueuedTurnResult> {
    const scope = conversationScope(input);
    const deliveryKey = requireBoundedString(input.deliveryKey, 128);
    const turn = await Turn()
      .findOneAndUpdate(
        {
          ...scope,
          _id: input.queuedTurnId,
          deliveryKey,
          status: { $in: ['queued', 'claimed'] },
        },
        {
          $set: {
            status: 'dead',
            terminalReceipt: {
              outcome: 'dead',
              settledAt: input.settledAt,
              failure: {
                code: requireBoundedString(input.failure.code, 128),
                message: requireBoundedString(input.failure.message, 2048),
              },
            },
          },
          $unset: { activeSlot: 1, claimId: 1, claimBy: 1, claimUntil: 1 },
        },
        { new: true },
      )
      .lean<IAgentQueuedTurn>();
    if (turn != null) {
      return { outcome: 'dead', turn: toRecord(turn) };
    }
    const current = await Turn()
      .findOne({ ...scope, _id: input.queuedTurnId })
      .lean<IAgentQueuedTurn>();
    if (current == null) {
      return { outcome: 'missing', turn: null };
    }
    if (['admitted', 'cancelled', 'dead'].includes(current.status)) {
      return { outcome: 'already_terminal', turn: toRecord(current) };
    }
    return { outcome: 'conflict', turn: toRecord(current) };
  }

  async function getEffectiveAgentQueuedTurnPredecessor(
    input: AgentQueuedTurnConversationScope & {
      sequence: number;
      expectedPredecessorCreatedAt?: number;
    },
  ): Promise<number | undefined> {
    if (!Number.isSafeInteger(input.sequence) || input.sequence <= 0) {
      throw new TypeError('Agent queued turn sequence must be a positive integer');
    }
    const rootEpoch = normalizePredecessor(input.expectedPredecessorCreatedAt);
    if (rootEpoch == null) {
      return undefined;
    }
    const predecessor = await Turn()
      .findOne({
        ...conversationScope(input),
        sequence: { $lt: input.sequence },
        expectedPredecessorCreatedAt: rootEpoch,
        status: 'admitted',
        'terminalReceipt.outcome': 'admitted',
        'terminalReceipt.generationCreatedAt': { $exists: true },
      })
      .sort({ sequence: -1 })
      .select('terminalReceipt.generationCreatedAt')
      .lean<IAgentQueuedTurn>();
    return predecessor?.terminalReceipt?.generationCreatedAt;
  }

  async function drainAgentQueuedTurns(
    input: AgentQueuedTurnOwnerScope & {
      conversationId?: string;
      settledAt?: Date;
    },
  ): Promise<number> {
    const settledAt = input.settledAt ?? new Date();
    const result = await Turn().updateMany(
      {
        ...ownerScope(input),
        ...(input.conversationId != null && {
          conversationId: requireBoundedString(input.conversationId, 256),
        }),
        status: { $in: ['queued', 'claimed'] },
      },
      {
        $set: {
          status: 'cancelled',
          terminalReceipt: {
            outcome: 'cancelled',
            settledAt,
            failure: {
              code: 'OWNER_DRAINED',
              message: 'Queued turn owner was drained',
            },
          },
        },
        $unset: { activeSlot: 1, claimId: 1, claimBy: 1, claimUntil: 1 },
      },
    );
    await Turn().updateMany(
      {
        ...ownerScope(input),
        ...(input.conversationId != null && {
          conversationId: requireBoundedString(input.conversationId, 256),
        }),
        status: 'cancelled',
        deliveryKey: { $exists: false },
      },
      { $set: { deliveryState: 'retired' } },
    );
    return result.modifiedCount;
  }

  async function deleteAgentQueuedTurns(
    input: AgentQueuedTurnOwnerScope & { conversationId?: string },
  ): Promise<number> {
    const scope = {
      ...ownerScope(input),
      ...(input.conversationId != null && {
        conversationId: requireBoundedString(input.conversationId, 256),
      }),
    };
    const [turns] = await Promise.all([Turn().deleteMany(scope), Sequence().deleteMany(scope)]);
    return turns.deletedCount;
  }

  async function retireConversationLane(
    user: Types.ObjectId,
    target: AgentQueuedTurnDeletionTarget,
    retiredAt: Date,
  ): Promise<void> {
    if (target.allTenants === true) {
      const lanes = await Sequence()
        .find({ user, conversationId: requireBoundedString(target.conversationId, 256) })
        .select('tenantId')
        .lean<IAgentQueuedTurnSequence[]>();
      for (const lane of lanes) {
        await retireConversationLane(
          user,
          {
            conversationId: target.conversationId,
            ...(lane.tenantId != null && { tenantId: lane.tenantId }),
          },
          retiredAt,
        );
      }
      return;
    }
    const input: AgentQueuedTurnConversationScope = {
      user,
      ...(target.tenantId != null && { tenantId: target.tenantId }),
      conversationId: target.conversationId,
    };
    const _id = laneKey(input);
    const scope = conversationScope(input);
    for (let attempt = 0; attempt < LANE_WRITER_RETRIES; attempt++) {
      const now = new Date();
      const retired = await Sequence()
        .findOneAndUpdate(
          {
            _id,
            ...scope,
            retiredAt: { $exists: false },
            $or: [{ writerId: { $exists: false } }, { writerUntil: { $lte: now } }],
          },
          {
            $set: { retiredAt },
            $unset: { writerId: 1, writerUntil: 1 },
            $setOnInsert: { ...conversationFields(input), value: 0 },
          },
          { new: true, upsert: true },
        )
        .lean<IAgentQueuedTurnSequence>()
        .catch((error: unknown) => {
          if ((error as DuplicateKeyError).code === DUPLICATE_KEY) {
            return null;
          }
          throw error;
        });
      if (retired?.retiredAt != null) {
        return;
      }
      const achieved = await Sequence().exists({ _id, ...scope, retiredAt: { $exists: true } });
      if (achieved != null) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, LANE_WRITER_RETRY_MS));
    }
    throw new Error('Agent queued turn lane could not be retired before conversation deletion');
  }

  async function prepareAgentQueuedTurnConversationDeletion(input: {
    user: Types.ObjectId;
    targets: readonly AgentQueuedTurnDeletionTarget[];
    settledAt?: Date;
  }): Promise<string[]> {
    const scope = deletionScope(input);
    const settledAt = input.settledAt ?? new Date();
    for (const target of input.targets) {
      await retireConversationLane(input.user, target, settledAt);
    }
    await Turn().updateMany(
      { ...scope, status: { $in: ['reserving', 'queued', 'claimed'] } },
      {
        $set: {
          status: 'cancelled',
          terminalReceipt: {
            outcome: 'cancelled',
            settledAt,
            failure: {
              code: 'OWNER_DRAINED',
              message: 'Queued turn owner was drained',
            },
          },
        },
        $unset: { activeSlot: 1, claimId: 1, claimBy: 1, claimUntil: 1 },
      },
    );
    await Promise.all([
      Turn().updateMany(
        { ...scope, status: 'cancelled', deliveryKey: { $exists: false } },
        { $set: { deliveryState: 'retired' } },
      ),
      Turn().updateMany(
        {
          ...scope,
          status: { $in: ['cancelled', 'dead'] },
          deliveryKey: { $exists: true },
          deliveryState: { $exists: false },
        },
        { $set: { deliveryState: 'published' } },
      ),
    ]);
    const turns = await Turn()
      .find({
        ...scope,
        status: { $in: ['cancelled', 'dead'] },
        deliveryKey: { $exists: true },
        deliveryState: { $ne: 'retired' },
      })
      .select('deliveryKey')
      .lean<Array<Pick<IAgentQueuedTurn, 'deliveryKey'>>>();
    return [
      ...new Set(turns.flatMap((turn) => (turn.deliveryKey == null ? [] : [turn.deliveryKey]))),
    ];
  }

  async function deletePreparedAgentQueuedTurnConversations(input: {
    user: Types.ObjectId;
    targets: readonly AgentQueuedTurnDeletionTarget[];
  }): Promise<number> {
    const scope = deletionScope(input);
    const blocker = await Turn().exists({
      $and: [
        scope,
        {
          status: { $ne: 'admitted' },
          $or: [
            { deliveryKey: { $exists: true }, deliveryState: { $ne: 'retired' } },
            { status: { $in: ['reserving', 'queued', 'claimed'] } },
          ],
        },
      ],
    });
    if (blocker != null) {
      throw new Error('Agent queued turn deliveries must retire before conversation deletion');
    }
    const turns = await Turn().deleteMany(scope);
    return turns.deletedCount;
  }

  async function markAgentQueuedTurnDeliveryRetired(input: {
    deliveryKey: string;
  }): Promise<boolean> {
    const deliveryKey = requireBoundedString(input.deliveryKey, 128);
    const result = await Turn().updateOne(
      {
        deliveryKey,
        status: { $in: ['admitted', 'cancelled', 'dead'] },
      },
      { $set: { deliveryState: 'retired' } },
    );
    if (result.modifiedCount === 1) {
      return true;
    }
    const achieved = await Turn().exists({
      deliveryKey,
      deliveryState: 'retired',
    });
    return achieved != null;
  }

  async function deleteAllAgentQueuedTurnsForUser(input: {
    user: Types.ObjectId;
  }): Promise<number> {
    const [turns] = await Promise.all([
      Turn().deleteMany({ user: input.user }),
      Sequence().deleteMany({ user: input.user }),
    ]);
    return turns.deletedCount;
  }

  return {
    ensureAgentQueuedTurnIndexes,
    enqueueAgentQueuedTurn,
    getAgentQueuedTurnByClientRequestId,
    listActiveAgentQueuedTurns,
    listAgentQueuedTurnReceipts,
    findQueuedTurnsNeedingDelivery,
    reserveAgentQueuedTurnDelivery,
    markQueuedTurnScheduled,
    cancelAgentQueuedTurn,
    claimNextAgentQueuedTurn,
    releaseAgentQueuedTurn,
    markAgentQueuedTurnAdmitted,
    deadLetterAgentQueuedTurn,
    getEffectiveAgentQueuedTurnPredecessor,
    drainAgentQueuedTurns,
    deleteAgentQueuedTurns,
    prepareAgentQueuedTurnConversationDeletion,
    deletePreparedAgentQueuedTurnConversations,
    markAgentQueuedTurnDeliveryRetired,
    deleteAllAgentQueuedTurnsForUser,
  };
}
