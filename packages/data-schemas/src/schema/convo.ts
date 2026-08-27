import { Schema } from 'mongoose';
import { conversationPreset } from './defaults';
import { IConversation } from '~/types';

const convoSchema: Schema<IConversation> = new Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
      meiliIndex: true,
    },
    title: {
      type: String,
      default: 'New Chat',
      meiliIndex: true,
    },
    user: {
      type: String,
      index: true,
      meiliIndex: true,
    },
    messages: [{ type: Schema.Types.ObjectId, ref: 'Message' }],
    isTemporary: {
      type: Boolean,
      default: false,
    },
    ...conversationPreset,
    agent_id: {
      type: String,
    },
    subagentThread: {
      type: {
        rootConversationId: { type: String, required: true },
        parentConversationId: { type: String, required: true },
        parentMessageId: { type: String, required: true },
        parentToolCallId: { type: String, required: true },
        parentAgentId: { type: String },
        subagentType: { type: String, required: true },
        subagentKind: { type: String, enum: ['agent', 'graph'], required: true },
        depth: { type: Number, min: 1, required: true },
      },
      _id: false,
      default: undefined,
    },
    /** Mongo-backed continuation lease shared by every API replica. */
    subagentThreadLease: {
      type: {
        token: { type: String, required: true },
        taskId: { type: String, required: true },
        expiresAt: { type: Date, required: true },
      },
      _id: false,
      default: undefined,
      select: false,
    },
    /** Authenticated event sources address child actors through this opaque binding.
     * The source never supplies the stored agent/thread target during delivery. */
    agentEventBinding: {
      type: {
        bindingId: { type: String, required: true },
        sourceKeyId: { type: String, required: true },
        actorId: { type: String, required: true },
      },
      _id: false,
      default: undefined,
      select: false,
    },
    /** Committed event-actor state. Invocation forks live in the checkpointer;
     * only the current and previous committed identities live with the binding. */
    agentEventActor: {
      type: {
        generation: { type: Number, min: 1, required: true },
        checkpoint: {
          type: {
            threadId: { type: String, required: true },
            checkpointId: { type: String, required: true },
            checkpointNs: { type: String, required: true },
          },
          _id: false,
          required: true,
        },
        previousCheckpoint: {
          type: {
            threadId: { type: String, required: true },
            checkpointId: { type: String, required: true },
            checkpointNs: { type: String, required: true },
          },
          _id: false,
          default: undefined,
        },
        requiresColdStart: { type: Boolean, default: undefined },
      },
      _id: false,
      default: undefined,
      select: false,
    },
    /** Fail-closed invocation proof. Active records block later turns through checkpoint,
     * history, and outcome settlement; settled receipts no longer block new IDs but keep
     * delayed owners from reacquiring an invocation that already applied its action. */
    agentEventActorReconciliations: {
      type: [
        {
          invocationId: { type: String, required: true },
          actionAdmitted: { type: Boolean, default: undefined },
          status: {
            type: String,
            enum: [
              'invocation_pending',
              'persistence_pending',
              'history_persisted',
              'commit_conflict',
              'commit_indeterminate',
              'persistence_failed',
              'settled',
            ],
            required: true,
          },
          checkpoint: {
            type: {
              threadId: { type: String, required: true },
              checkpointId: { type: String, default: undefined },
              checkpointNs: { type: String, required: true },
            },
            _id: false,
            required: true,
          },
          action: {
            type: {
              toolName: { type: String, required: true },
              toolCallId: { type: String, default: undefined },
            },
            _id: false,
            required: true,
          },
          error: { type: String, default: undefined },
          resolution: {
            type: String,
            enum: ['checkpoint_verified', 'action_compensated', 'history_repaired'],
            default: undefined,
          },
          observedAt: { type: Date, required: true },
          _id: false,
        },
      ],
      default: undefined,
      select: false,
    },
    /** Bumped by every legacy-path event so a concurrently prepared fork can
     * never commit past an invalidation the head fields alone cannot show. */
    agentEventActorEpoch: {
      type: Number,
      default: undefined,
      select: false,
    },
    /** In-flight legacy turn. Blocks fork execution and commit until the
     * turn's history is durable; a crash leaves it set, failing closed. */
    agentEventActorLegacyTurn: {
      type: {
        token: { type: String, required: true },
        startedAt: { type: Date, required: true },
      },
      _id: false,
      default: undefined,
      select: false,
    },
    tags: {
      type: [String],
      default: [],
      meiliIndex: true,
    },
    chatProjectId: {
      type: String,
      default: null,
      index: true,
    },
    files: {
      type: [String],
    },
    expiredAt: {
      type: Date,
    },
    tenantId: {
      type: String,
      index: true,
    },
    pinned: {
      type: Boolean,
    },
    /**
     * When the chat was filed away. Absent on conversations archived before this field
     * existed, and on every unarchived one, so readers fall back to `createdAt`.
     */
    archivedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

convoSchema.index({ expiredAt: 1 }, { expireAfterSeconds: 0 });
convoSchema.index({ createdAt: 1, updatedAt: 1 });
convoSchema.index({ conversationId: 1, user: 1, tenantId: 1 }, { unique: true });
convoSchema.index({ tenantId: 1, isTemporary: 1, createdAt: -1, _id: -1 });
convoSchema.index({ user: 1, _id: 1 });
convoSchema.index({ user: 1, chatProjectId: 1, updatedAt: -1, _id: -1 });
convoSchema.index({ user: 1, chatProjectId: 1, createdAt: -1, _id: -1 });
/** The archive view pages by `archivedAt`, then `createdAt`, then `_id`; the middle key
 * carries the legacy group, whose rows all share a missing `archivedAt`. */
convoSchema.index({ user: 1, isArchived: 1, archivedAt: -1, createdAt: -1, _id: -1 });

/** The sidebar's pinned section filters on user + pinned and pages by `updatedAt`. */
convoSchema.index({ user: 1, pinned: 1, updatedAt: -1, _id: -1 });

convoSchema.index({ user: 1, isTemporary: 1, expiredAt: 1 });
/** Owner-scoped child-thread cascade lookup used when a parent is deleted. */
convoSchema.index({ user: 1, 'subagentThread.parentConversationId': 1 });
convoSchema.index({ user: 1, 'subagentThreadLease.expiresAt': 1 });
convoSchema.index(
  { 'agentEventBinding.bindingId': 1 },
  { unique: true, sparse: true, name: 'agent_event_binding_unique' },
);
convoSchema.index(
  {
    'agentEventActorReconciliations.status': 1,
    'agentEventActorReconciliations.observedAt': 1,
  },
  { sparse: true, name: 'agent_event_actor_reconciliation_metrics' },
);
// index for MeiliSearch sync operations
convoSchema.index({ _meiliIndex: 1, isTemporary: 1, expiredAt: 1 });

export default convoSchema;
