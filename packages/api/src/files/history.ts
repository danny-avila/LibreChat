import { ContentTypes } from 'librechat-data-provider';
import type { TAttachment, TFile, TMessage } from 'librechat-data-provider';

/** The three places a stored message can carry a file reference. */
type FileRefBearer = Pick<TMessage, 'files' | 'attachments' | 'content'>;

/** Owner scope a historical file query must stay inside. */
export interface FileOwner {
  id?: string;
  tenantId?: string;
}

export interface OwnerFileFilter {
  file_id: { $in: string[] };
  user: string;
  tenantId?: string;
}

/**
 * Every file reference on one stored message: direct uploads, tool-produced
 * attachments, and the refs a persisted steer part carries inside assistant
 * content (see `stampSteerPartMedia`, which reuses the same lookup).
 */
export function collectHistoricalFileRefs(message: FileRefBearer): Array<Partial<TFile>> {
  const refs = collectMessageFileRefs(message);
  for (const { refs: steerRefs } of collectSteerFileRefs(message)) {
    refs.push(...steerRefs);
  }
  return refs;
}

/** Only what the MESSAGE itself carries: direct uploads and tool attachments. */
export function collectMessageFileRefs(message: FileRefBearer): Array<Partial<TFile>> {
  const refs: Array<Partial<TFile>> = [];
  if (Array.isArray(message.files)) {
    refs.push(...message.files);
  }
  if (Array.isArray(message.attachments)) {
    refs.push(...(message.attachments as Array<Partial<TAttachment>> as Array<Partial<TFile>>));
  }
  return refs;
}

/**
 * Refs carried inside persisted steer parts, with the index of the part that
 * carries them. A steer is the USER interrupting mid-run, and it replays as its
 * own message, so anything hydrated from it belongs on that part rather than on
 * the assistant turn that happens to contain it.
 */
export function collectSteerFileRefs(
  message: FileRefBearer,
): Array<{ index: number; refs: Array<Partial<TFile>> }> {
  if (!Array.isArray(message.content)) {
    return [];
  }
  const found: Array<{ index: number; refs: Array<Partial<TFile>> }> = [];
  for (let index = 0; index < message.content.length; index++) {
    const part = message.content[index];
    if (part?.type === ContentTypes.STEER && Array.isArray(part.files) && part.files.length > 0) {
      found.push({ index, refs: part.files });
    }
  }
  return found;
}

/** De-duplicated file ids across a whole branch, for one batched lookup. */
export function collectHistoricalFileIds(messages: FileRefBearer[]): string[] {
  const fileIds = new Set<string>();
  for (const message of messages) {
    for (const ref of collectHistoricalFileRefs(message)) {
      if (ref?.file_id) {
        fileIds.add(ref.file_id);
      }
    }
  }
  return Array.from(fileIds);
}

/**
 * Owner-scoped filter for a historical file lookup. Returns `null` when there
 * is nothing to look up or no authenticated owner to scope by, so a caller can
 * never widen the query to another user's files.
 */
export function buildOwnerFileFilter(
  fileIds: string[],
  user?: FileOwner | null,
): OwnerFileFilter | null {
  if (!user?.id || fileIds.length === 0) {
    return null;
  }
  const filter: OwnerFileFilter = {
    file_id: { $in: fileIds },
    user: user.id,
  };
  if (user.tenantId) {
    filter.tenantId = user.tenantId;
  }
  return filter;
}
