import { logger } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';

/**
 * Leading sub-second retries cover the common case of a fast background task
 * settling moments before the dispatch turn finalizes its message row — an
 * immediate follow-up turn should find the attachments already anchored.
 * The long tail covers dispatch turns that keep running for minutes.
 */
const BACKGROUND_PATCH_RETRY_DELAYS_MS = [
  250, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 30_000, 60_000, 120_000, 180_000, 240_000, 300_000,
];

interface HarvestFileRef {
  id: string;
  name: string;
  storage_session_id?: string;
  inherited?: boolean;
}

interface HarvestArtifact {
  session_id?: string;
  files?: HarvestFileRef[];
}

export interface ProcessedCodeOutput {
  file?: { file_id: string } & Record<string, unknown>;
  finalize?: () => Promise<unknown>;
  previewRevision?: number;
}

export interface CodeHarvestDeps {
  req: ServerRequest;
  /** Data-schemas method: idempotent tool-call part patch + attachment append. */
  updateToolCallResult: (params: {
    userId: string;
    messageId: string;
    conversationId: string;
    toolCallId: string;
    agentId?: string;
    output?: string;
    attachments?: unknown[];
  }) => Promise<{ matched: boolean; unfinished: boolean }>;
  /** Host file service: downloads and persists one code output file. */
  processCodeOutput: (params: {
    req: ServerRequest;
    id: string;
    name: string;
    messageId: string;
    toolCallId: string;
    conversationId: string;
    agentId?: string;
    session_id?: string;
    freshClaimAfter?: number;
  }) => Promise<ProcessedCodeOutput | null>;
  /** Host file service: runs the deferred office-preview extraction. */
  runPreviewFinalize: (params: {
    finalize?: () => Promise<unknown>;
    fileId: string;
    previewRevision?: number;
  }) => void;
}

export interface CodeHarvestParams {
  toolName: string;
  toolCallId: string;
  messageId?: string;
  conversationId?: string;
  /** Dispatching agent — scopes the part patch when provider tool-call ids
   *  repeat across agents in one response message. */
  agentId?: string;
  /** When the background task was DISPATCHED — the ordering anchor for the
   *  stale-output guard. A slow task settling after a newer run wrote the
   *  same filename must not overwrite it, so harvest wall-clock is wrong. */
  dispatchedAt?: number;
  output?: string;
  artifact?: unknown;
  attachments?: unknown[];
  reapply?: boolean;
}

export type CodeHarvestHandler = (
  params: CodeHarvestParams,
) => Promise<{ attachments: unknown[] } | null>;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Handles a backgrounded code-execution result once the detached call settles:
 * persists generated files (same `processCodeOutput` path as the foreground
 * callback, anchored to the ORIGINAL messageId/toolCallId), then patches the
 * dispatch turn's tool-call part output and appends the attachments to that
 * message row — so the backgrounded call reads like a foreground one on reload
 * and in later model turns, and next-turn file priming picks the outputs up.
 *
 * The dispatch turn may still be streaming when a fast task settles (its
 * response message is only saved at turn end), so the row patch retries on a
 * backoff schedule before giving up; files are already persisted either way,
 * and the poll turn still delivers content/attachments live. With
 * `reapply: true` it only re-applies the (idempotent) row patch using the
 * provided attachments — no file processing — to heal a full-row save that
 * reverted the anchor.
 */
export function createBackgroundCodeResultHandler(deps: CodeHarvestDeps): CodeHarvestHandler {
  const { req, updateToolCallResult, processCodeOutput, runPreviewFinalize } = deps;
  return async ({
    toolCallId,
    messageId,
    conversationId,
    agentId,
    dispatchedAt,
    output,
    artifact,
    attachments: knownAttachments,
    reapply,
  }) => {
    const userId = req.user?.id;
    if (!userId || !messageId || !conversationId) {
      return null;
    }

    if (reapply === true) {
      const reapplied = await updateToolCallResult({
        userId,
        messageId,
        conversationId,
        toolCallId,
        agentId,
        output,
        attachments: knownAttachments ?? [],
      });
      if (!reapplied.matched) {
        logger.debug(
          `[background] Re-anchor found no row for message ${messageId} (tool call ${toolCallId}).`,
        );
      }
      return { attachments: knownAttachments ?? [] };
    }

    const attachments: unknown[] = [];
    /** Ordering guard: a filename claim whose row was really written after
     *  this task was DISPATCHED belongs to a newer run — the harvest must
     *  not overwrite it with stale bytes, no matter how late it settles. */
    const freshClaimAfter = dispatchedAt ?? Date.now();
    const codeArtifact = (artifact ?? {}) as HarvestArtifact;
    const files = Array.isArray(codeArtifact.files) ? codeArtifact.files : [];
    for (const file of files) {
      if (file.inherited === true) {
        continue;
      }
      try {
        const result = await processCodeOutput({
          req,
          id: file.id,
          name: file.name,
          messageId,
          toolCallId,
          conversationId,
          /** Rides the attachment so the client can route it to the right
           *  card when provider ids repeat across agents. */
          agentId,
          session_id: file.storage_session_id ?? codeArtifact.session_id,
          freshClaimAfter,
        });
        if (result?.file) {
          attachments.push(result.file);
          /** No live stream at completion time; the client's preview polling
           *  (or the poll turn's re-emit) surfaces the finalized preview. */
          runPreviewFinalize({
            finalize: result.finalize,
            fileId: result.file.file_id,
            previewRevision: result.previewRevision,
          });
        }
      } catch (error) {
        logger.error('[background] Error processing code output file:', error);
      }
    }

    let patched = false;
    for (let attempt = 0; attempt <= BACKGROUND_PATCH_RETRY_DELAYS_MS.length; attempt++) {
      const result = await updateToolCallResult({
        userId,
        messageId,
        conversationId,
        toolCallId,
        agentId,
        output,
        attachments,
      });
      patched = result.matched;
      /** An `unfinished` match is a mid-turn partial save (client disconnect):
       *  the eventual finalize overwrites it with in-memory content — the
       *  handle JSON — so keep re-applying (idempotent) until a finalized row
       *  holds the patch. */
      if (
        (result.matched && !result.unfinished) ||
        attempt === BACKGROUND_PATCH_RETRY_DELAYS_MS.length
      ) {
        break;
      }
      await sleep(BACKGROUND_PATCH_RETRY_DELAYS_MS[attempt]);
    }
    if (!patched) {
      logger.warn(
        `[background] Could not anchor code result onto message ${messageId} (tool call ${toolCallId}); ` +
          'the dispatch turn never persisted. Poll delivery still returns the result.',
      );
    }
    return { attachments };
  };
}
