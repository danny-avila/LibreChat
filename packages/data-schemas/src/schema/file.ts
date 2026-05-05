import mongoose, { Schema } from 'mongoose';
import { FileContext, FileSources } from 'librechat-data-provider';
import type { IMongoFile } from '~/types';

const file: Schema<IMongoFile> = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },
    conversationId: {
      type: String,
      ref: 'Conversation',
      index: true,
    },
    messageId: {
      type: String,
      index: true,
    },
    file_id: {
      type: String,
      index: true,
      required: true,
    },
    temp_file_id: {
      type: String,
    },
    bytes: {
      type: Number,
      required: true,
    },
    filename: {
      type: String,
      required: true,
    },
    filepath: {
      type: String,
      required: true,
    },
    object: {
      type: String,
      required: true,
      default: 'file',
    },
    embedded: {
      type: Boolean,
    },
    type: {
      type: String,
      required: true,
    },
    text: {
      type: String,
    },
    textFormat: {
      /* 'html' when the backend produced a sanitized HTML preview
       * (office-type CDN/mammoth output), 'text' for plain-text
       * extracts (RAG / pdf-parse / mammoth.extractRawText). Clients
       * gate office-bucket routing on textFormat === 'html' to
       * prevent injecting RAG-extracted plain text into the iframe
       * as HTML. See Codex P1 review on PR #12934. */
      type: String,
      enum: ['html', 'text'],
    },
    status: {
      /* Two-phase code-execution flow: phase-1 emits the attachment
       * record immediately with 'pending'; background phase-2 (HTML
       * extraction) updates to 'ready' or 'failed'. Absent on legacy
       * records and on file kinds that never expect a preview. */
      type: String,
      enum: ['pending', 'ready', 'failed'],
      index: true,
    },
    previewError: {
      type: String,
      /* Bounded to short machine-readable reasons (`'timeout'`,
       * `'parser-error'`, `'orphaned'`, `'unexpected'`). Cap prevents a
       * future codepath from accidentally persisting a stack trace or
       * full error message — would bloat documents and ship a wall of
       * text into the UI tooltip. */
      maxlength: 200,
    },
    context: {
      type: String,
    },
    usage: {
      type: Number,
      required: true,
      default: 0,
    },
    source: {
      type: String,
      default: FileSources.local,
    },
    model: {
      type: String,
    },
    width: Number,
    height: Number,
    metadata: {
      fileIdentifier: String,
    },
    expiresAt: {
      type: Date,
      expires: 3600, // 1 hour in seconds
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

file.index({ createdAt: 1, updatedAt: 1 });
file.index(
  { filename: 1, conversationId: 1, context: 1, tenantId: 1 },
  { unique: true, partialFilterExpression: { context: FileContext.execute_code } },
);

export default file;
