import { LocalStorageKeys } from 'librechat-data-provider';
import { getTimestampedValue, getTimestamp, setTimestamp } from '~/utils/timestamps';
import { FILE_SEARCH_UPLOAD_PREFIX } from '~/utils/localStorage';

const keyFor = (fileId: string) => `${FILE_SEARCH_UPLOAD_PREFIX}${fileId}`;

type Intent = { conversationId: string; requestedAt: number };

export function beginFileSearchUpload(
  fileId: string,
  conversationId: string,
): { requestedAt: number; persisted: boolean } {
  const requestedAt = Date.now();
  try {
    localStorage.setItem(keyFor(fileId), JSON.stringify({ conversationId, requestedAt }));
    return { requestedAt, persisted: true };
  } catch {
    // The live recovery callback still owns activation when storage is unavailable.
  }
  return { requestedAt, persisted: false };
}

export function cancelFileSearchUpload(fileId: string): void {
  try {
    localStorage.removeItem(keyFor(fileId));
  } catch {
    // Best-effort storage cleanup.
  }
}

/** Completes only an explicit upload intent, never an arbitrary embedded attachment. */
export function completeFileSearchUpload(
  fileId: string,
  conversationId: string,
  requestedAt?: number,
): boolean {
  let intent: Intent | null = null;
  try {
    const value = JSON.parse(localStorage.getItem(keyFor(fileId)) ?? 'null') as Intent | null;
    if (value && typeof value.conversationId === 'string' && Number.isFinite(value.requestedAt)) {
      intent = value;
    }
  } catch {
    // A live callback can recover without a stored record.
  }
  intent ??= requestedAt == null ? null : { conversationId, requestedAt };
  if (!intent || intent.conversationId !== conversationId) {
    return false;
  }
  cancelFileSearchUpload(fileId);
  const preferenceKey = `${LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_}${conversationId}`;
  try {
    if (
      getTimestampedValue(preferenceKey) === 'false' &&
      (getTimestamp(preferenceKey) ?? 0) > intent.requestedAt
    ) {
      return false;
    }
    localStorage.setItem(preferenceKey, 'true');
    setTimestamp(preferenceKey);
  } catch {
    // Persistence is best-effort; the accepted live upload must remain usable.
  }
  return true;
}
