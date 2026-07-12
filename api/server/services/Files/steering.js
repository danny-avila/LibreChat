const { logger } = require('@librechat/data-schemas');
const { formatMessage } = require('@librechat/agents');
const { prependFileContext, toSteerFileRef } = require('@librechat/api');
const { ContentTypes } = require('librechat-data-provider');
const { getFiles } = require('~/models');

/** Fields persisted on the steer content part / surfaced to clients
 *  (shared picker — single source of truth for the ref shape). */
function toSteerFileRefs(files) {
  return files.map(toSteerFileRef).filter(Boolean);
}

function collectFileIds(files) {
  return [
    ...new Set(
      (files ?? [])
        .map((file) => file?.file_id)
        .filter((id) => typeof id === 'string' && id.length > 0),
    ),
  ];
}

function buildOwnerFilter(fileIds, user) {
  if (!user?.id || fileIds.length === 0) {
    return null;
  }
  const filter = { file_id: { $in: fileIds }, user: user.id };
  if (user.tenantId) {
    filter.tenantId = user.tenantId;
  }
  return filter;
}

/**
 * Encodes authorized file docs for one steer and assembles the multimodal
 * content array, reusing the exact pipeline regular user turns go through:
 * `addFileContextToMessage` + `processAttachments` (single-pass categorize +
 * encode images/documents/videos/audios) on a throwaway message, then the
 * SDK's `formatMessage` for part ordering (no `endpoint` arg — matching the
 * agents payload path, which formats without one).
 */
async function encodeSteerContent({ client, text, steerId, fileDocs }) {
  const pseudo = { messageId: `steer:${steerId}` };
  await client.addFileContextToMessage(pseudo, fileDocs);
  const validated = await client.processAttachments(pseudo, fileDocs);
  const formatted = formatMessage({
    message: {
      role: 'user',
      content: text,
      image_urls: pseudo.image_urls,
      documents: pseudo.documents,
      videos: pseudo.videos,
      audios: pseudo.audios,
    },
  });
  if (pseudo.fileContext) {
    prependFileContext(formatted, pseudo.fileContext);
  }
  const content = Array.isArray(formatted.content)
    ? formatted.content
    : [{ type: ContentTypes.TEXT, text: formatted.content ?? text }];
  const refSource = Array.isArray(validated) && validated.length > 0 ? validated : fileDocs;
  return { content, files: toSteerFileRefs(refSource) };
}

/**
 * Resolves a queued steer's attachment refs into encoded model content for
 * live mid-run injection. Only `file_id`s are trusted from the item — the
 * fetch is owner-scoped and every other field is re-derived from the DB docs.
 * Returns `undefined` when nothing authorized remains (the drain hook then
 * injects text only, so the user's words always land).
 *
 * @param {object} params
 * @param {object} params.client - the AgentClient owning the run (BaseClient encode methods)
 * @param {ServerRequest} params.req
 * @param {import('@librechat/api').SteerQueueItem} params.item
 */
async function buildSteerMedia({ client, req, item }) {
  const ids = collectFileIds(item.files);
  const filter = buildOwnerFilter(ids, req?.user);
  if (filter == null) {
    return undefined;
  }
  const rawDocs = await getFiles(filter, {}, {});
  if (!Array.isArray(rawDocs) || rawDocs.length === 0) {
    logger.warn(`[buildSteerMedia] No authorized files for steer=${item.steerId}`);
    return undefined;
  }
  // `$in` results come back in database order — restore the composer order so
  // "compare the first and second image" means what the user saw.
  const docsById = new Map(rawDocs.map((file) => [file.file_id, file]));
  const fileDocs = ids.map((id) => docsById.get(id)).filter(Boolean);
  return encodeSteerContent({ client, text: item.text, steerId: item.steerId, fileDocs });
}

/**
 * Re-encodes attachments for persisted steer parts of PAST turns and stamps
 * the assembled content array as a transient `media` field, which the SDK's
 * `formatAgentMessages` prefers over the plain text when reconstructing the
 * steer's HumanMessage. Mirrors `addPreviousAttachments`: refs are re-fetched
 * (one batched, owner-scoped query for every steer part in the payload) and
 * re-encoded per turn — encoded data is never persisted. Parts are replaced
 * immutably so the stamp cannot leak into a message save.
 *
 * @param {object} params
 * @param {object} params.client - the AgentClient owning the run (BaseClient encode methods)
 * @param {ServerRequest} params.req
 * @param {Array<{ role?: string; content?: unknown }>} params.payload
 * @param {Map<string, object>} [params.docsById] - owner-scoped file docs already
 *   fetched this turn (`addPreviousAttachments` collects steer-part refs into its
 *   single historical-files query); when present, NO extra query is issued —
 *   an id missing from the map is unauthorized or deleted, exactly as if the
 *   fallback query had excluded it.
 * @returns {Promise<Array<{ index: number; media: Array<object> }>>} one entry
 *   per stamped part (payload index + the stamped content array) so the caller
 *   can fold the re-encoded media into its token accounting — the stamp runs
 *   after the message loop finalized its counts.
 */
async function stampSteerPartMedia({ client, req, payload, docsById }) {
  const stampTargets = [];
  for (let index = 0; index < payload.length; index++) {
    const message = payload[index];
    if (message?.role !== 'assistant' || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      if (part?.type === ContentTypes.STEER && Array.isArray(part.files) && part.files.length > 0) {
        stampTargets.push({ message, part, index });
      }
    }
  }
  if (stampTargets.length === 0) {
    return [];
  }

  let resolvedDocsById = docsById;
  if (resolvedDocsById == null) {
    const allIds = collectFileIds(stampTargets.flatMap(({ part }) => part.files));
    const filter = buildOwnerFilter(allIds, req?.user);
    if (filter == null) {
      return [];
    }
    const fileDocs = await getFiles(filter, {}, {});
    if (!Array.isArray(fileDocs) || fileDocs.length === 0) {
      return [];
    }
    resolvedDocsById = new Map(fileDocs.map((file) => [file.file_id, file]));
  }

  const stamped = await Promise.all(
    stampTargets.map(async ({ message, part, index }) => {
      const docs = part.files.map((file) => resolvedDocsById.get(file?.file_id)).filter(Boolean);
      if (docs.length === 0) {
        return null;
      }
      try {
        const { content } = await encodeSteerContent({
          client,
          text: part[ContentTypes.STEER] ?? '',
          steerId: part.steerId ?? 'replay',
          fileDocs: docs,
        });
        message.content = message.content.map((candidate) =>
          candidate === part ? { ...candidate, media: content } : candidate,
        );
        return { index, media: content };
      } catch (error) {
        logger.warn(
          `[stampSteerPartMedia] Failed to re-encode steer media (steer=${part.steerId}); replaying text only`,
          error,
        );
        return null;
      }
    }),
  );
  return stamped.filter(Boolean);
}

module.exports = { buildSteerMedia, stampSteerPartMedia };
