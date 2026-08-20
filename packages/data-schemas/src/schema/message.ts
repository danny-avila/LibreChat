import mongoose, { Schema } from 'mongoose';
import type { IMessage } from '~/types/message';

const messageSchema: Schema<IMessage> = new Schema(
  {
    messageId: {
      type: String,
      required: true,
      index: true,
      meiliIndex: true,
    },
    conversationId: {
      type: String,
      index: true,
      required: true,
      meiliIndex: true,
    },
    user: {
      type: String,
      index: true,
      required: true,
      default: null,
      meiliIndex: true,
    },
    model: {
      type: String,
      default: null,
    },
    endpoint: {
      type: String,
    },
    conversationSignature: {
      type: String,
    },
    clientId: {
      type: String,
    },
    invocationId: {
      type: Number,
    },
    parentMessageId: {
      type: String,
    },
    tokenCount: {
      type: Number,
    },
    summaryTokenCount: {
      type: Number,
    },
    sender: {
      type: String,
      meiliIndex: true,
    },
    text: {
      type: String,
      meiliIndex: true,
    },
    summary: {
      type: String,
    },
    isCreatedByUser: {
      type: Boolean,
      required: true,
      default: false,
    },
    isTemporary: {
      type: Boolean,
      default: false,
    },
    unfinished: {
      type: Boolean,
      default: false,
    },
    error: {
      type: Boolean,
      default: false,
    },
    finish_reason: {
      type: String,
    },
    feedback: {
      type: {
        rating: {
          type: String,
          enum: ['thumbsUp', 'thumbsDown'],
          required: true,
        },
        tag: {
          type: mongoose.Schema.Types.Mixed,
          required: false,
        },
        text: {
          type: String,
          required: false,
        },
      },
      default: undefined,
      required: false,
    },
    langfuseSampled: {
      type: Boolean,
    },
    langfuseDestinationIds: {
      type: [String],
      default: undefined,
    },
    _meiliIndex: {
      type: Boolean,
      required: false,
      select: false,
      default: false,
    },
    files: { type: [{ type: mongoose.Schema.Types.Mixed }], default: undefined },
    content: {
      type: [{ type: mongoose.Schema.Types.Mixed }],
      default: undefined,
      meiliIndex: true,
    },
    thread_id: {
      type: String,
    },
    /* frontend components */
    iconURL: {
      type: String,
    },
    metadata: { type: mongoose.Schema.Types.Mixed },
    subagentTranscript: {
      type: {
        taskId: { type: String, required: true },
        mode: { type: String, enum: ['append', 'replace'], required: true },
        messagesJson: { type: String, required: true },
      },
      _id: false,
      select: false,
      default: undefined,
    },
    /** Durable, server-only marker used to make detached retries at-most-once. */
    subagentTask: {
      type: {
        attemptKey: { type: String, required: true },
        parentRunId: { type: String },
        requestFingerprint: { type: String },
        status: {
          type: String,
          enum: ['running', 'completed', 'error', 'cancelled'],
          required: true,
        },
        resultClaim: {
          type: {
            kind: { type: String, enum: ['manual', 'wakeup'], required: true },
            claimId: { type: String, required: true },
            claimedAt: { type: Date, required: true },
          },
          _id: false,
          default: undefined,
        },
      },
      _id: false,
      select: false,
      default: undefined,
    },
    contextMeta: {
      type: {
        calibrationRatio: { type: Number },
        encoding: { type: String },
      },
      _id: false,
      default: undefined,
    },
    attachments: { type: [{ type: mongoose.Schema.Types.Mixed }], default: undefined },
    /**
     * Skill names the user invoked manually via the `$` popover on this turn.
     * UI metadata only — `SkillPills` on the frontend renders these on
     * the user message bubble so the selection persists through reload and
     * shows in history. Runtime skill resolution lives separately on the
     * request body, not on the message itself.
     */
    manualSkills: { type: [String], default: undefined },
    /**
     * Skill names auto-primed on this turn because their frontmatter declares
     * `always-apply: true`. Persisted at turn time (not reconstructed on
     * render) because `Skill.alwaysApply` is mutable — if an admin flips the
     * flag off later, historical turns must still show the pinned badges on
     * the user bubble to preserve the audit trail of what actually ran.
     */
    alwaysAppliedSkills: { type: [String], default: undefined },
    /**
     * Verbatim excerpts the user quoted (via the "Add to chat" selection
     * popup) to reference on this turn. UI metadata only — `MessageQuotes`
     * renders these on the user bubble so the references persist through
     * reload and history. The excerpts are merged into the user message text
     * sent to the model at request time (counted in the user message token
     * count), so they are not duplicated into the stored `text`.
     */
    quotes: { type: [String], default: undefined },
    /*
    attachments: {
      type: [
        {
          file_id: String,
          filename: String,
          filepath: String,
          expiresAt: Date,
          width: Number,
          height: Number,
          type: String,
          conversationId: String,
          messageId: {
            type: String,
            required: true,
          },
          toolCallId: String,
        },
      ],
      default: undefined,
    },
    */
    expiredAt: {
      type: Date,
    },
    addedConvo: {
      type: Boolean,
      default: undefined,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

messageSchema.index({ expiredAt: 1 }, { expireAfterSeconds: 0 });
messageSchema.index({ createdAt: 1 });
messageSchema.index({ messageId: 1, user: 1, tenantId: 1 }, { unique: true });
messageSchema.index({ tenantId: 1, isTemporary: 1, createdAt: -1, _id: -1 });
messageSchema.index({
  tenantId: 1,
  isTemporary: 1,
  isCreatedByUser: 1,
  user: 1,
  createdAt: -1,
  _id: -1,
});

/**
 * Serves the conversation fetch ({conversationId, user} filter + createdAt
 * sort) from the index alone; without it Mongo fetches every full document in
 * the conversation and sorts them in memory. tenantId is deliberately not in
 * the middle: untenanted deployments issue no tenantId predicate, and a gap in
 * the prefix would push the sort back into memory for them.
 */
messageSchema.index({ conversationId: 1, user: 1, createdAt: 1 });

// index for MeiliSearch sync operations
messageSchema.index({ _meiliIndex: 1, isTemporary: 1, expiredAt: 1 });

export default messageSchema;
