import mongoose, { Schema } from 'mongoose';
import { FileContext, FileSources } from 'librechat-data-provider';
import type { IMongoFile } from '~/types';
import { codeEnvRefMapSchema, codeEnvRefSchema } from './codeEnvRef';

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
    storageKey: {
      type: String,
    },
    storageRegion: {
      type: String,
    },
    object: {
      type: String,
      required: true,
      default: 'file',
    },
    embedded: {
      type: Boolean,
    },
    hash: {
      /* Hex SHA-256 of the uploaded bytes. Stamped on `file_search`
       * uploads so a later upload of identical content can reuse the
       * embeddings already in the vector store instead of paying to
       * embed the same document twice. Absent on every other upload
       * path and on records predating content addressing. */
      type: String,
    },
    vectorId: {
      /* Set only when this record borrows another file's embeddings:
       * the `file_id` the RAG API actually holds the chunks under.
       * Absent means the file owns its own vectors under its own
       * `file_id` — resolve with `resolveVectorId` rather than reading
       * this directly. */
      type: String,
    },
    vectorExtension: {
      /* Lowercased extension of the filename the RAG API was given, dot
       * included. It picks its document loader from that before falling back
       * to the content type, so the same bytes as `.csv` and as `.txt` are
       * chunked differently and are not interchangeable. Part of the reuse
       * key rather than a filter applied afterwards, so a match can never
       * fall outside the query's window. */
      type: String,
    },
    vectorOwner: {
      /* Who the RAG API stamped as the owner of those chunks: the agent id
       * for knowledge files, the user id for chat attachments. Reads from a
       * different owner are refused, so content may only be reused between
       * records sharing this value — membership in an agent's resource list
       * does not prove it, since a file uploaded to one agent can be
       * attached to another. Absent on records predating the field, which
       * therefore never qualify for reuse. */
      type: String,
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
      /* Deferred-preview code-execution flow: the immediate persist
       * step writes the record with 'pending'; the background render
       * (HTML extraction) updates to 'ready' or 'failed'. Absent on
       * legacy records and on file kinds that never expect a preview. */
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
    previewRevision: {
      /* Generation marker for the deferred-preview lifecycle. Stamped
       * by the immediate persist step on every emit (each new emit
       * gets a fresh UUID); the deferred preview render's `updateFile`
       * only commits when the marker still matches what it was when
       * extraction started. Without this, two turns reusing the same
       * `(filename, conversationId)` share a `file_id`, and an older
       * render finishing after a newer one would silently overwrite
       * the newer record with stale `text`/`status`. (Codex P1 review
       * on PR #12957.) */
      type: String,
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
      codeEnvRef: {
        type: codeEnvRefSchema,
        default: undefined,
      },
      codeEnvRefs: {
        type: codeEnvRefMapSchema,
        default: undefined,
      },
      /** Dispatch-order stamp of the last writer (or claimant, on insert):
       *  the background harvest's stale-output guard compares writer
       *  dispatch order so an older task settling late cannot overwrite a
       *  newer task's same-named output. */
      sourceDispatchedAt: {
        type: Number,
        default: undefined,
      },
    },
    expiresAt: {
      /* Short-lived upload TTL managed by MongoDB. This is separate from
       * retention-scoped `expiredAt`, which is swept by application code
       * after storage cleanup succeeds. */
      type: Date,
      expires: 3600, // 1 hour in seconds
    },
    tenantId: {
      type: String,
      index: true,
    },
    expiredAt: {
      /* Retention deadline for persisted files. The file sweep deletes the
       * backing storage first, then removes this metadata record. */
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

file.index({ expiredAt: 1 });
file.index({ createdAt: 1, updatedAt: 1 });
/* Serves `findVectorReuseCandidates`: equality on the hash and the owner that
 * scopes it, then `createdAt` so the oldest-first sort and its limit come off
 * the index instead of a scan. The remaining predicates match a handful of
 * documents at most — files with identical bytes under one owner — so they are
 * cheaper to filter than to index.
 *
 * Both partial filters below use `$exists` rather than `$type`: only the
 * uploads that carry these fields need indexing, but the planner will only
 * reach for a partial index when the query provably implies its filter, and it
 * does not infer a type from an equality. A `$type` filter leaves the index
 * built, eligible-looking and never used. */
file.index(
  { hash: 1, vectorOwner: 1, createdAt: 1 },
  { partialFilterExpression: { hash: { $exists: true } } },
);
file.index({ vectorId: 1 }, { partialFilterExpression: { vectorId: { $exists: true } } });
file.index(
  { filename: 1, conversationId: 1, context: 1, tenantId: 1 },
  { unique: true, partialFilterExpression: { context: FileContext.execute_code } },
);

export default file;
