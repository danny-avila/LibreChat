import { LocalStorageKeys } from 'librechat-data-provider';

export const CHAT_TITLE_IN_TAB_KEY = 'chatTitleInTab';

const getAppTitle = (): string => localStorage.getItem(LocalStorageKeys.APP_TITLE) ?? '';

/** Reads the setting straight from localStorage so non-React callers stay in sync with the atom. */
export const isChatTitleInTabEnabled = (): boolean => {
  try {
    const saved = localStorage.getItem(CHAT_TITLE_IN_TAB_KEY);
    return saved === null ? true : (JSON.parse(saved) as boolean);
  } catch {
    return true;
  }
};

/**
 * Sets the tab title to the conversation title, or to the app title when the
 * conversation title is empty or the user opted out of chat titles in the tab.
 * Pass `enabled` when the atom's value is already known, since Recoil writes to
 * localStorage after the change handler runs.
 */
export const setDocumentTitle = (title?: string | null, enabled?: boolean): void => {
  const showChatTitle = enabled ?? isChatTitleInTabEnabled();
  document.title = showChatTitle && title != null && title !== '' ? title : getAppTitle();
};
