import { v4 } from 'uuid';

export const FILE_SEARCH_CHOICE_PREFIX = 'file-search-choice:';
type FileSearchChoice = { revision: string; enabled: boolean };
const unavailableStorage = new Map<string, FileSearchChoice>();

export function getFileSearchChoice(conversationId: string): FileSearchChoice | null {
  const fallback = unavailableStorage.get(conversationId);
  if (fallback) {
    return fallback;
  }
  try {
    const choice = JSON.parse(
      localStorage.getItem(`${FILE_SEARCH_CHOICE_PREFIX}${conversationId}`) ?? 'null',
    ) as FileSearchChoice | null;
    return choice && typeof choice.revision === 'string' && typeof choice.enabled === 'boolean'
      ? choice
      : null;
  } catch {
    return null;
  }
}

/** Only the explicit toggle handler writes this revision; hydration and sync never do. */
export function setFileSearchChoice(conversationId: string, enabled: boolean): void {
  const choice = { revision: v4(), enabled };
  try {
    localStorage.setItem(`${FILE_SEARCH_CHOICE_PREFIX}${conversationId}`, JSON.stringify(choice));
    unavailableStorage.delete(conversationId);
  } catch {
    unavailableStorage.set(conversationId, choice);
  }
}

export function clearFileSearchChoices(): void {
  unavailableStorage.clear();
}
