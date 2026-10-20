import { LocalStorageKeys } from 'librechat-data-provider';
import { isTimestampExpired, setTimestamp } from '~/utils/timestamps';
import { FILE_SEARCH_UPLOAD_PREFIX } from '~/utils/localStorage';
import { getFileSearchChoice } from '~/utils/choices';

const keyFor = (fileId: string) => `${FILE_SEARCH_UPLOAD_PREFIX}${fileId}`;

export type FileSearchUploadContext = Readonly<{
  conversationId: string;
  choiceRevision: string | null;
  createdAt: number;
}>;
type Intent = FileSearchUploadContext;

export function captureFileSearchUpload(conversationId: string): FileSearchUploadContext {
  return {
    conversationId,
    choiceRevision: getFileSearchChoice(conversationId)?.revision ?? null,
    createdAt: Date.now(),
  };
}

export function beginFileSearchUpload(
  fileId: string,
  operation: string | FileSearchUploadContext,
): { choiceRevision: string | null; persisted: boolean } {
  const context = typeof operation === 'string' ? captureFileSearchUpload(operation) : operation;
  const { choiceRevision } = context;
  try {
    localStorage.setItem(keyFor(fileId), JSON.stringify(context));
    return { choiceRevision, persisted: true };
  } catch {
    // The live recovery callback still owns activation when storage is unavailable.
  }
  return { choiceRevision, persisted: false };
}

export function cancelFileSearchUpload(fileId: string): void {
  try {
    localStorage.removeItem(keyFor(fileId));
  } catch {
    // Best-effort storage cleanup.
  }
}

function readIntent(fileId: string): Intent | null {
  let intent: Intent | null = null;
  try {
    const value = JSON.parse(localStorage.getItem(keyFor(fileId)) ?? 'null') as Intent | null;
    if (
      value &&
      typeof value.conversationId === 'string' &&
      (value.choiceRevision === null || typeof value.choiceRevision === 'string') &&
      Number.isFinite(value.createdAt) &&
      !isTimestampExpired(value.createdAt)
    ) {
      intent = value;
    }
  } catch {
    // A live callback can recover without a stored record.
  }
  return intent;
}

export function hasPendingFileSearchUpload(fileId: string, conversationId: string): boolean {
  return readIntent(fileId)?.conversationId === conversationId;
}

/** Completes only an explicit upload intent, never an arbitrary embedded attachment. */
export function completeFileSearchUpload(
  fileId: string,
  conversationId: string,
  choiceRevision?: string | null,
): boolean {
  let intent = readIntent(fileId);
  intent ??=
    choiceRevision === undefined ? null : { conversationId, choiceRevision, createdAt: Date.now() };
  if (!intent) {
    cancelFileSearchUpload(fileId);
    return false;
  }
  if (intent.conversationId !== conversationId) {
    return false;
  }
  cancelFileSearchUpload(fileId);
  const choice = getFileSearchChoice(conversationId);
  if (choice && choice.revision !== intent.choiceRevision && !choice.enabled) {
    return false;
  }
  const preferenceKey = `${LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_}${conversationId}`;
  try {
    localStorage.setItem(preferenceKey, 'true');
    setTimestamp(preferenceKey);
  } catch {
    // Persistence is best-effort; the accepted live upload must remain usable.
  }
  return true;
}
