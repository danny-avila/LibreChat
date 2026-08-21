import type { NavigateFunction } from 'react-router-dom';

export function navigateToNewConversation(
  navigate: NavigateFunction,
  path: string,
  replaceHistory = false,
) {
  if (replaceHistory) {
    navigate(path, { replace: true });
    return;
  }
  navigate(path);
}
