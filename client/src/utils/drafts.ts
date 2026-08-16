import debounce from 'lodash/debounce';
import { Constants, LocalStorageKeys } from 'librechat-data-provider';

export type PendingTextAttachmentDraft = {
  text: string;
  selectionStart: number;
};

export type FilesDraft = {
  fileIds: string[];
  pendingPastes: Record<string, PendingTextAttachmentDraft>;
};

type StoredPendingTextAttachmentDraft = {
  encodedText: string;
  selectionStart: number;
};

type StoredFilesDraft = {
  fileIds: string[];
  pendingPastes: Record<string, StoredPendingTextAttachmentDraft>;
};

const newConversationDraftTokens = new Map<number, symbol>();

/** Per-composer identity so a side-by-side new-chat reset cannot discard another pane's paste recovery. */
export const getNewConversationDraftToken = (index = 0): symbol => {
  const existing = newConversationDraftTokens.get(index);
  if (existing) {
    return existing;
  }
  const token = Symbol('new-conversation-draft');
  newConversationDraftTokens.set(index, token);
  return token;
};

export const renewNewConversationDraftToken = (index = 0): void => {
  newConversationDraftTokens.set(index, Symbol('new-conversation-draft'));
};

/** Draft key used while a run is in flight. Extra panes get a suffix so one run cannot migrate another pane's attachments. */
export const getPendingDraftId = (index = 0): string =>
  index === 0 ? Constants.PENDING_CONVO : `${Constants.PENDING_CONVO}:${index}`;

export const clearDraft = debounce((id?: string | null) => {
  localStorage.removeItem(`${LocalStorageKeys.TEXT_DRAFT}${id ?? ''}`);
}, 2500);

/** Synchronously removes both text and file drafts for a conversation (or NEW_CONVO fallback) */
export const clearAllDrafts = (conversationId?: string | null) => {
  const key = conversationId || Constants.NEW_CONVO;
  localStorage.removeItem(`${LocalStorageKeys.TEXT_DRAFT}${key}`);
  localStorage.removeItem(`${LocalStorageKeys.FILES_DRAFT}${key}`);
};

export const encodeBase64 = (plainText: string): string => {
  try {
    const textBytes = new TextEncoder().encode(plainText);
    return btoa(String.fromCharCode(...textBytes));
  } catch {
    return '';
  }
};

export const decodeBase64 = (base64String: string): string => {
  try {
    const bytes = atob(base64String);
    const uint8Array = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      uint8Array[i] = bytes.charCodeAt(i);
    }
    return new TextDecoder().decode(uint8Array);
  } catch {
    return '';
  }
};

export const getFilesDraft = (id: string): FilesDraft => {
  const storedValue = localStorage.getItem(`${LocalStorageKeys.FILES_DRAFT}${id}`);
  if (!storedValue) {
    return { fileIds: [], pendingPastes: {} };
  }

  try {
    const storedDraft = JSON.parse(storedValue) as string[] | StoredFilesDraft;
    if (Array.isArray(storedDraft)) {
      return { fileIds: storedDraft, pendingPastes: {} };
    }

    const pendingPastes = Object.fromEntries(
      Object.entries(storedDraft.pendingPastes ?? {}).map(
        ([fileId, pendingPaste]): [string, PendingTextAttachmentDraft] => [
          fileId,
          {
            text: decodeBase64(pendingPaste.encodedText),
            selectionStart: pendingPaste.selectionStart,
          },
        ],
      ),
    );

    return {
      fileIds: Array.isArray(storedDraft.fileIds) ? storedDraft.fileIds : [],
      pendingPastes,
    };
  } catch {
    return { fileIds: [], pendingPastes: {} };
  }
};

export const setFilesDraft = (id: string, draft: FilesDraft): void => {
  const key = `${LocalStorageKeys.FILES_DRAFT}${id}`;
  const pendingPasteEntries = Object.entries(draft.pendingPastes);
  if (draft.fileIds.length === 0 && pendingPasteEntries.length === 0) {
    localStorage.removeItem(key);
    return;
  }

  if (pendingPasteEntries.length === 0) {
    localStorage.setItem(key, JSON.stringify(draft.fileIds));
    return;
  }

  const pendingPastes = Object.fromEntries(
    pendingPasteEntries.map(
      ([fileId, pendingPaste]): [string, StoredPendingTextAttachmentDraft] => [
        fileId,
        {
          encodedText: encodeBase64(pendingPaste.text),
          selectionStart: pendingPaste.selectionStart,
        },
      ],
    ),
  );

  localStorage.setItem(
    key,
    JSON.stringify({ fileIds: draft.fileIds, pendingPastes } satisfies StoredFilesDraft),
  );
};

export const setPendingTextAttachmentDraft = ({
  id,
  fileId,
  text,
  selectionStart,
}: {
  id: string;
  fileId: string;
  text: string;
  selectionStart: number;
}): void => {
  const draft = getFilesDraft(id);
  setFilesDraft(id, {
    fileIds: draft.fileIds.includes(fileId) ? draft.fileIds : [...draft.fileIds, fileId],
    pendingPastes: {
      ...draft.pendingPastes,
      [fileId]: { text, selectionStart },
    },
  });
};

export const removePendingTextAttachmentDraft = ({
  id,
  fileId,
  removeFile = false,
}: {
  id: string;
  fileId: string;
  removeFile?: boolean;
}): void => {
  const draft = getFilesDraft(id);
  const pendingPastes = { ...draft.pendingPastes };
  delete pendingPastes[fileId];
  setFilesDraft(id, {
    fileIds: removeFile
      ? draft.fileIds.filter((draftFileId) => draftFileId !== fileId)
      : draft.fileIds,
    pendingPastes,
  });
};

export const setDraft = ({ id, value }: { id: string; value?: string }) => {
  if (value && value.length > 1) {
    localStorage.setItem(`${LocalStorageKeys.TEXT_DRAFT}${id}`, encodeBase64(value));
    return;
  }
  localStorage.removeItem(`${LocalStorageKeys.TEXT_DRAFT}${id}`);
};

export const getDraft = (id?: string): string | null =>
  decodeBase64((localStorage.getItem(`${LocalStorageKeys.TEXT_DRAFT}${id ?? ''}`) ?? '') || '');

/**
 * Draft-key prefix for a live `ask_user_question` answer phase. While the
 * composer doubles as the free-form answer box, its autosave switches to a key
 * derived from the pause's action id — so the conversation's own draft is left
 * untouched and comes back once the question resolves, and a half-typed answer
 * survives reloads/navigation for as long as its question stays live.
 */
export const ASK_ANSWER_DRAFT_PREFIX = 'ask-answer:';

export const getAskAnswerDraftId = (actionId: string): string =>
  `${ASK_ANSWER_DRAFT_PREFIX}${actionId}`;

export const isAskAnswerDraftId = (id?: string | null): boolean =>
  typeof id === 'string' && id.startsWith(ASK_ANSWER_DRAFT_PREFIX);
