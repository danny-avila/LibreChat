import { Constants, LocalStorageKeys } from 'librechat-data-provider';
import type { CapturedComposerDraft } from '~/utils/drafts';
import { getTimestampedValue, isTimestampExpired, setTimestamp } from '~/utils/timestamps';
import { getFileSearchChoice, transferFileSearchChoice } from '~/utils/choices';
import { getNewConversationDraftRevision } from '~/utils/drafts';
import { FILE_SEARCH_UPLOAD_PREFIX } from '~/utils/localStorage';

const keyFor = (fileId: string) => `${FILE_SEARCH_UPLOAD_PREFIX}${fileId}`;

export type FileSearchUploadContext = Readonly<{
  conversationId: string;
  choiceRevision: string | null;
  createdAt: number;
  projectId?: string | null;
  newChatGeneration?: Readonly<{ index: number; revision: string }>;
}>;
type Intent = FileSearchUploadContext;
const owners = new WeakMap<FileSearchUploadContext, CapturedComposerDraft>();
const assignments = new Map<string, { owner: CapturedComposerDraft; dispose: () => void }>();

export function transferFileSearchPreference(
  sourceId: string,
  targetId: string,
): boolean | undefined {
  let enabled = transferFileSearchChoice(sourceId, targetId);
  const targetKey = `${LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_}${targetId}`;
  try {
    const preference =
      getTimestampedValue(targetKey) ??
      getTimestampedValue(`${LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_}${sourceId}`);
    if (enabled == null && (preference === 'true' || preference === 'false')) {
      enabled = preference === 'true';
    }
    if (enabled != null) {
      localStorage.setItem(targetKey, JSON.stringify(enabled));
      setTimestamp(targetKey);
    }
  } catch {
    // A blocked store must not prevent the acknowledged identity handoff.
  }
  return enabled;
}

export function captureFileSearchUpload(
  conversationId: string,
  owner?: CapturedComposerDraft,
): FileSearchUploadContext {
  const context = {
    get conversationId() {
      return owner?.conversationId() ?? conversationId;
    },
    choiceRevision: getFileSearchChoice(conversationId)?.revision ?? null,
    createdAt: Date.now(),
    projectId: new URLSearchParams(window.location.search).get('projectId'),
    newChatGeneration:
      conversationId === Constants.NEW_CONVO
        ? (owner?.newChatGeneration ?? { index: 0, revision: getNewConversationDraftRevision(0) })
        : undefined,
  };
  if (owner) owners.set(context, owner);
  return context;
}

export function beginFileSearchUpload(
  fileId: string,
  operation: string | FileSearchUploadContext,
): { choiceRevision: string | null; persisted: boolean } {
  const context = typeof operation === 'string' ? captureFileSearchUpload(operation) : operation;
  const { choiceRevision } = context;
  assignments.get(fileId)?.dispose();
  const owner = owners.get(context);
  if (owner?.registered) {
    assignments.set(fileId, {
      owner,
      dispose: owner.onAssignment((sourceId, targetId) => {
        transferFileSearchPreference(sourceId, targetId);
        try {
          localStorage.setItem(keyFor(fileId), JSON.stringify(context));
        } catch {
          /* Live recovery owns completion. */
        }
      }),
    });
  }
  try {
    localStorage.setItem(keyFor(fileId), JSON.stringify(context));
    return { choiceRevision, persisted: true };
  } catch {
    // The live recovery callback still owns activation when storage is unavailable.
  }
  return { choiceRevision, persisted: false };
}

export function cancelFileSearchUpload(fileId: string): void {
  assignments.get(fileId)?.dispose();
  assignments.delete(fileId);
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
      if (value.conversationId === Constants.NEW_CONVO) {
        const generation = value.newChatGeneration;
        if (
          !generation ||
          !Number.isInteger(generation.index) ||
          generation.index < 0 ||
          generation.revision !== getNewConversationDraftRevision(generation.index)
        ) {
          return null;
        }
      }
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
    if (!assignments.has(fileId)) cancelFileSearchUpload(fileId);
    return false;
  }
  if (intent.conversationId !== conversationId) {
    return false;
  }
  const owner = assignments.get(fileId)?.owner;
  const changedProject =
    conversationId === Constants.NEW_CONVO &&
    intent.projectId !== undefined &&
    intent.projectId !== new URLSearchParams(window.location.search).get('projectId');
  if (changedProject || (owner && !owner() && !owner.retainsFile(fileId))) {
    cancelFileSearchUpload(fileId);
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
