import { logger } from '@librechat/data-schemas';
import { formatMessage } from '@librechat/agents';
import { ContentTypes } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { TFile } from 'librechat-data-provider';
import type { SteerQueueItem } from '~/stream/interfaces/IJobStore';
import type { SteerMediaResult } from './runtime';
import type { SteerRequestUser } from './request';
import { toSteerFileRef, collectFileIds, buildOwnerFilter } from './refs';
import { prependFileContext } from '../client';

/** The BaseClient encode surface the steer media pipeline reuses. */
export interface SteerMediaClient {
  addFileContextToMessage(message: Record<string, unknown>, files: IMongoFile[]): Promise<void>;
  processAttachments(
    message: Record<string, unknown>,
    files: IMongoFile[],
  ): Promise<IMongoFile[] | undefined>;
}

/** `db.getFiles`-shaped dependency (injected — this package has no DB access). */
export type SteerFileFetcher = (
  filter: Record<string, unknown>,
  sortOptions: Record<string, unknown>,
  selectFields: Record<string, unknown>,
) => Promise<IMongoFile[] | null | undefined>;

interface PseudoMessage {
  messageId: string;
  fileContext?: string;
  image_urls?: Array<Record<string, unknown>>;
  documents?: Array<Record<string, unknown>>;
  videos?: Array<Record<string, unknown>>;
  audios?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface SteerPart {
  type?: string;
  steerId?: string;
  files?: Partial<TFile>[];
  media?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** One stamped steer part: payload index + the stamped content array, so the
 *  caller can fold the re-encoded media into its token accounting. */
export interface StampedSteerMedia {
  index: number;
  media: Array<Record<string, unknown>>;
  /** The bare steer body, so token accounting can subtract what the
   *  assistant message already counted (file context must still count). */
  steerText: string;
}

/**
 * Encodes authorized file docs for one steer and assembles the multimodal
 * content array, reusing the exact pipeline regular user turns go through:
 * `addFileContextToMessage` + `processAttachments` (single-pass categorize +
 * encode images/documents/videos/audios) on a throwaway message, then the
 * SDK's `formatMessage` for part ordering (no `endpoint` arg — matching the
 * agents payload path, which formats without one).
 */
async function encodeSteerContent({
  client,
  text,
  steerId,
  fileDocs,
}: {
  client: SteerMediaClient;
  text: string;
  steerId: string;
  fileDocs: IMongoFile[];
}): Promise<SteerMediaResult> {
  const pseudo: PseudoMessage = { messageId: `steer:${steerId}` };
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
    } as Parameters<typeof formatMessage>[0]['message'],
  }) as { content: string | Array<Record<string, unknown>> };
  if (pseudo.fileContext) {
    prependFileContext(formatted, pseudo.fileContext);
  }
  const content = Array.isArray(formatted.content)
    ? formatted.content
    : [{ type: ContentTypes.TEXT, text: formatted.content ?? text }];
  const refSource = Array.isArray(validated) && validated.length > 0 ? validated : fileDocs;
  const files = refSource.map(toSteerFileRef).filter((ref): ref is Partial<TFile> => ref != null);
  return { content, files };
}

/**
 * Resolves a queued steer's attachment refs into encoded model content for
 * live mid-run injection. Only `file_id`s are trusted from the item — the
 * fetch is owner-scoped and every other field is re-derived from the DB docs,
 * restored to the composer's ref order (a `$in` result comes back in database
 * order). Returns `undefined` when nothing authorized remains (the drain hook
 * then injects text only, so the user's words always land).
 */
export async function buildSteerMedia({
  client,
  user,
  item,
  getFiles,
}: {
  client: SteerMediaClient;
  user: SteerRequestUser | undefined;
  item: SteerQueueItem;
  getFiles: SteerFileFetcher;
}): Promise<SteerMediaResult | undefined> {
  const ids = collectFileIds(item.files);
  const filter = buildOwnerFilter(ids, user);
  if (filter == null) {
    return undefined;
  }
  const rawDocs = await getFiles(filter, {}, {});
  if (!Array.isArray(rawDocs) || rawDocs.length === 0) {
    logger.warn(`[buildSteerMedia] No authorized files for steer=${item.steerId}`);
    return undefined;
  }
  const docsById = new Map(rawDocs.map((file) => [file.file_id, file]));
  const fileDocs = ids
    .map((id) => docsById.get(id))
    .filter((doc): doc is IMongoFile => doc != null);
  return encodeSteerContent({ client, text: item.text, steerId: item.steerId, fileDocs });
}

/**
 * Re-encodes attachments for persisted steer parts of PAST turns and stamps
 * the assembled content array as a transient `media` field, which the SDK's
 * `formatAgentMessages` prefers over the plain text when reconstructing the
 * steer's HumanMessage. Refs are re-encoded per turn — encoded data is never
 * persisted — and parts are replaced immutably so the stamp cannot leak into
 * a message save. Encodes run in parallel after doc resolution.
 *
 * `docsById` should be the owner-scoped doc map `addPreviousAttachments`
 * already fetched this turn (its single historical-files query collects
 * steer-part refs); when present, NO extra query is issued — an id missing
 * from the map is unauthorized or deleted, exactly as if the fallback query
 * had excluded it.
 */
export async function stampSteerPartMedia({
  client,
  user,
  payload,
  docsById,
  getFiles,
}: {
  client: SteerMediaClient;
  user: SteerRequestUser | undefined;
  payload: Array<{ role?: string; content?: unknown }>;
  docsById?: Map<string, IMongoFile>;
  getFiles: SteerFileFetcher;
}): Promise<StampedSteerMedia[]> {
  const stampTargets: Array<{
    message: { content?: unknown };
    part: SteerPart;
    index: number;
  }> = [];
  for (let index = 0; index < payload.length; index++) {
    const message = payload[index];
    if (message?.role !== 'assistant' || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content as SteerPart[]) {
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
    const allIds = collectFileIds(stampTargets.flatMap(({ part }) => part.files ?? []));
    const filter = buildOwnerFilter(allIds, user);
    if (filter == null) {
      return [];
    }
    const fileDocs = await getFiles(filter, {}, {});
    if (!Array.isArray(fileDocs) || fileDocs.length === 0) {
      return [];
    }
    resolvedDocsById = new Map(fileDocs.map((file) => [file.file_id, file]));
  }
  const docs = resolvedDocsById;

  const stamped = await Promise.all(
    stampTargets.map(async ({ message, part, index }) => {
      const partDocs = (part.files ?? [])
        .map((file) => (file?.file_id != null ? docs.get(file.file_id) : undefined))
        .filter((doc): doc is IMongoFile => doc != null);
      if (partDocs.length === 0) {
        return null;
      }
      try {
        const { content } = await encodeSteerContent({
          client,
          text: (part[ContentTypes.STEER] as string | undefined) ?? '',
          steerId: part.steerId ?? 'replay',
          fileDocs: partDocs,
        });
        message.content = (message.content as SteerPart[]).map((candidate) =>
          candidate === part ? { ...candidate, media: content } : candidate,
        );
        return {
          index,
          media: content,
          steerText: (part[ContentTypes.STEER] as string | undefined) ?? '',
        };
      } catch (error) {
        logger.warn(
          `[stampSteerPartMedia] Failed to re-encode steer media (steer=${part.steerId}); replaying text only`,
          error,
        );
        return null;
      }
    }),
  );
  return stamped.filter((entry): entry is StampedSteerMedia => entry != null);
}
