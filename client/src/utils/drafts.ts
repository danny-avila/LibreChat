import debounce from 'lodash/debounce';
import { Constants, LocalStorageKeys } from 'librechat-data-provider';

export type PendingTextAttachmentDraft = {
  text: string;
  selectionStart: number;
  selectionEnd?: number;
  replacedText?: string;
  sequence?: number;
};

export type FilesDraft = {
  fileIds: string[];
  pendingPastes: Record<string, PendingTextAttachmentDraft>;
};

type StoredPendingTextAttachmentDraft = {
  encodedText: string;
  selectionStart: number;
  selectionEnd?: number;
  encodedReplacedText?: string;
  sequence?: number;
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

/** Draft key for an idle unsaved chat. Extra panes get a suffix so two new composers do not share FILES_DRAFT. */
export const getNewConversationDraftId = (index = 0): string =>
  index === 0 ? Constants.NEW_CONVO : `${Constants.NEW_CONVO}:${index}`;

export const isNewConversationDraftId = (id?: string | null): boolean =>
  typeof id === 'string' &&
  (id === Constants.NEW_CONVO || id.startsWith(`${Constants.NEW_CONVO}:`));

export const getConversationDraftId = (index = 0, conversationId?: string | null): string =>
  conversationId == null || conversationId === '' || conversationId === Constants.NEW_CONVO
    ? getNewConversationDraftId(index)
    : conversationId;

export const getComposerDraftId = (
  index = 0,
  conversationId?: string | null,
  isSubmitting = false,
): string =>
  isSubmitting ? getPendingDraftId(index) : getConversationDraftId(index, conversationId);

const getReplacedLength = (pendingPaste: PendingTextAttachmentDraft): number => {
  if (pendingPaste.replacedText != null && pendingPaste.replacedText.length > 0) {
    return pendingPaste.replacedText.length;
  }
  if (pendingPaste.selectionEnd != null) {
    return Math.max(0, pendingPaste.selectionEnd - pendingPaste.selectionStart);
  }
  return 0;
};

export const applyPendingPasteToDraft = (
  draftText: string,
  pendingPaste: PendingTextAttachmentDraft,
): string => applyPendingPastesToDraft(draftText, [pendingPaste]);

/** Replay deletions in capture order, then insert paste text at offsets rebased onto that final snapshot. */
export const applyPendingPastesToDraft = (
  draftText: string,
  pendingPastes: PendingTextAttachmentDraft[],
): string => {
  if (pendingPastes.length === 0) {
    return draftText;
  }

  const ordered = pendingPastes.map((pendingPaste, index) => ({ pendingPaste, index }));
  ordered.sort(
    (a, b) =>
      (a.pendingPaste.sequence ?? a.index) - (b.pendingPaste.sequence ?? b.index) ||
      a.index - b.index,
  );

  let text = draftText;
  for (const { pendingPaste } of ordered) {
    const replacedText = pendingPaste.replacedText ?? '';
    const start = Math.min(pendingPaste.selectionStart, text.length);
    if (
      replacedText.length > 0 &&
      text.slice(start, start + replacedText.length) === replacedText
    ) {
      text = `${text.slice(0, start)}${text.slice(start + replacedText.length)}`;
    }
  }

  const insertions = ordered.map(({ pendingPaste }, index) => {
    let start = pendingPaste.selectionStart;
    for (const later of ordered.slice(index + 1)) {
      if (later.pendingPaste.selectionStart < start) {
        start -= getReplacedLength(later.pendingPaste);
      }
    }
    return { text: pendingPaste.text, start: Math.max(0, start), index };
  });
  insertions.sort((a, b) => b.start - a.start || b.index - a.index);

  for (const insertion of insertions) {
    const start = Math.min(insertion.start, text.length);
    text = `${text.slice(0, start)}${insertion.text}${text.slice(start)}`;
  }
  return text;
};

export const clearDraft = debounce((id?: string | null) => {
  localStorage.removeItem(`${LocalStorageKeys.TEXT_DRAFT}${id ?? ''}`);
}, 2500);

/** Synchronously removes both text and file drafts for a conversation (or NEW_CONVO fallback) */
export const clearAllDrafts = (conversationId?: string | null) => {
  const key = conversationId || Constants.NEW_CONVO;
  localStorage.removeItem(`${LocalStorageKeys.TEXT_DRAFT}${key}`);
  localStorage.removeItem(`${LocalStorageKeys.FILES_DRAFT}${key}`);
};

/** Clears this pane's pending and new-chat keys plus a concrete conversation draft, without touching another pane's unsuffixed `new` key. */
export const clearComposerDrafts = (index = 0, conversationId?: string | null): void => {
  const keys = new Set<string>([getPendingDraftId(index), getNewConversationDraftId(index)]);
  if (conversationId != null && conversationId !== '') {
    keys.add(getConversationDraftId(index, conversationId));
    if (conversationId !== Constants.NEW_CONVO && conversationId !== Constants.PENDING_CONVO) {
      keys.add(conversationId);
    }
  }
  for (const key of keys) {
    clearAllDrafts(key);
  }
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
            ...(pendingPaste.selectionEnd != null
              ? { selectionEnd: pendingPaste.selectionEnd }
              : {}),
            ...(pendingPaste.encodedReplacedText
              ? { replacedText: decodeBase64(pendingPaste.encodedReplacedText) }
              : {}),
            ...(pendingPaste.sequence != null ? { sequence: pendingPaste.sequence } : {}),
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
          ...(pendingPaste.selectionEnd != null &&
          pendingPaste.selectionEnd !== pendingPaste.selectionStart
            ? { selectionEnd: pendingPaste.selectionEnd }
            : {}),
          ...(pendingPaste.replacedText
            ? { encodedReplacedText: encodeBase64(pendingPaste.replacedText) }
            : {}),
          ...(pendingPaste.sequence != null ? { sequence: pendingPaste.sequence } : {}),
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
  selectionEnd,
  replacedText,
}: {
  id: string;
  fileId: string;
  text: string;
  selectionStart: number;
  selectionEnd?: number;
  replacedText?: string;
}): void => {
  const draft = getFilesDraft(id);
  const existing = draft.pendingPastes[fileId];
  const sequence =
    existing?.sequence ??
    Math.max(0, ...Object.values(draft.pendingPastes).map((paste) => paste.sequence ?? 0)) + 1;
  setFilesDraft(id, {
    fileIds: draft.fileIds.includes(fileId) ? draft.fileIds : [...draft.fileIds, fileId],
    pendingPastes: {
      ...draft.pendingPastes,
      [fileId]: {
        text,
        selectionStart,
        sequence,
        ...(selectionEnd != null ? { selectionEnd } : {}),
        ...(replacedText ? { replacedText } : {}),
      },
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
