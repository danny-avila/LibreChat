import { Document, Types } from 'mongoose';
import type { CodeEnvRef, CodeEnvRefMap } from 'librechat-data-provider';

export interface IMongoFile extends Omit<Document, 'model'> {
  user: Types.ObjectId;
  conversationId?: string;
  messageId?: string;
  file_id: string;
  temp_file_id?: string;
  bytes: number;
  text?: string;
  /**
   * Format of the `text` field — `'html'` when the backend produced
   * a sanitized full-document HTML preview (e.g. office types via
   * `bufferToOfficeHtml`), `'text'` for plain-text extracts (e.g.
   * RAG mammoth/pdf-parse output), `undefined` for legacy records
   * that pre-date the field. Clients MUST treat `undefined` as
   * `'text'` and refuse to inject the value into HTML contexts —
   * otherwise plain document text containing `<script>` tags would
   * become executable markup. See Codex P1 review on PR #12934.
   */
  textFormat?: 'html' | 'text';
  /**
   * Lifecycle of the inline preview rendered from `text`. Tracks the
   * deferred-preview code-execution flow (PR #12951 follow-up): the
   * immediate persist step saves the file blob and emits the attachment
   * record with `status: 'pending'`; a background render runs HTML
   * extraction and updates the record to `'ready'` (with `text` +
   * `textFormat`) or `'failed'` (with `previewError`). Decouples the
   * agent's final response from CPU-heavy office-format rendering.
   *
   * Absent for legacy records and for files that never expect a preview
   * (RAG uploads, images, plain-text artifacts). Clients MUST treat
   * `undefined` as `'ready'` so prior-version records render normally.
   */
  status?: 'pending' | 'ready' | 'failed';
  /**
   * Short machine-readable reason when `status === 'failed'` —
   * `'timeout'`, `'parser-error'`, `'oversized'`, `'orphaned'`. UI hint
   * for tooltip text; not user-facing prose. Absent otherwise.
   */
  previewError?: string;
  /**
   * Generation marker for the deferred-preview lifecycle. The
   * immediate persist step stamps a fresh UUID on every emit; the
   * deferred render's update only commits when the marker still
   * matches. Guards against an older render overwriting a newer
   * record on cross-turn filename reuse. Absent for legacy records
   * and for files that never expect a preview.
   */
  previewRevision?: string;
  filename: string;
  filepath: string;
  storageKey?: string;
  storageRegion?: string;
  object: 'file';
  embedded?: boolean;
  /**
   * Hex SHA-256 of the uploaded bytes, stamped on `file_search` uploads
   * so identical content can be recognized on a later upload. Absent on
   * other upload paths and on records predating content addressing.
   */
  hash?: string;
  /**
   * The `file_id` the RAG API holds this file's chunks under, set only
   * when the record borrows another file's embeddings. Absent means the
   * file owns its vectors under its own `file_id`; read it through
   * `resolveVectorId` so both cases are handled.
   */
  vectorId?: string;
  /**
   * Lowercased extension of the filename the RAG API was given. Its loader
   * keys on that before the content type, so identical bytes under different
   * extensions are chunked differently and cannot share embeddings.
   */
  vectorExtension?: string;
  /**
   * Who the RAG API stamped as the owner of this file's chunks — the agent
   * id for knowledge files, the user id for chat attachments. Reads from a
   * different owner are refused, so it is the only proof that two records
   * may share embeddings. Absent on records predating the field.
   */
  vectorOwner?: string;
  type: string;
  context?: string;
  usage: number;
  source: string;
  model?: string;
  width?: number;
  height?: number;
  metadata?: {
    /**
     * Code-environment cache pointer for files re-uploadable to
     * codeapi (chat attachments, agent tool resources, code-output
     * files). Carries the resource kind + identity so codeapi can
     * derive the sessionKey explicitly.
     */
    codeEnvRef?: CodeEnvRef;
    codeEnvRefs?: CodeEnvRefMap;
    /** Dispatch-order stamp for the current source artifact generation. */
    sourceDispatchedAt?: number;
  };
  expiresAt?: Date;
  expiredAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}
