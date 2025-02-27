import { LocalStorageKeys, TConversation } from 'librechat-data-provider';

// Key for tracking OpenID redirect attempts
export const OPENID_REDIRECT_KEY = 'openid_redirect_attempted';
// Cooldown period in milliseconds (5 minutes)
export const OPENID_REDIRECT_COOLDOWN = 5 * 60 * 1000;

export function getLocalStorageItems() {
  const items = {
    lastSelectedModel: localStorage.getItem(LocalStorageKeys.LAST_MODEL) ?? '',
    lastSelectedTools: localStorage.getItem(LocalStorageKeys.LAST_TOOLS) ?? '',
    lastConversationSetup: localStorage.getItem(LocalStorageKeys.LAST_CONVO_SETUP + '_0') ?? '',
  };

  const lastSelectedModel = items.lastSelectedModel
    ? (JSON.parse(items.lastSelectedModel) as Record<string, string | undefined> | null)
    : {};
  const lastSelectedTools = items.lastSelectedTools
    ? (JSON.parse(items.lastSelectedTools) as string[] | null)
    : [];
  const lastConversationSetup = items.lastConversationSetup
    ? (JSON.parse(items.lastConversationSetup) as Partial<TConversation> | null)
    : {};

  return {
    lastSelectedModel,
    lastSelectedTools,
    lastConversationSetup,
  };
}

/**
 * Handles the OpenID redirect logic to prevent infinite redirect loops
 * @param conditions Object containing conditions that must be met for redirect
 * @returns Boolean indicating whether to proceed with the redirect
 */
export function shouldRedirectToOpenID({
  redirectAttempted,
  openidLoginEnabled,
  openidAutoRedirect,
  serverDomain,
  authFailed = false,
}: {
  redirectAttempted: boolean;
  openidLoginEnabled?: boolean;
  openidAutoRedirect?: boolean;
  serverDomain?: string;
  authFailed?: boolean;
}): boolean {
  // Get timestamp of last redirect attempt from localStorage
  const lastRedirectAttempt = localStorage.getItem(OPENID_REDIRECT_KEY);
  const currentTime = Date.now();
  
  // Only redirect if all conditions are met
  if (
    !redirectAttempted &&
    openidLoginEnabled &&
    openidAutoRedirect &&
    serverDomain &&
    !authFailed &&
    (!lastRedirectAttempt || currentTime - parseInt(lastRedirectAttempt, 10) > OPENID_REDIRECT_COOLDOWN)
  ) {
    // Store the current timestamp in localStorage
    localStorage.setItem(OPENID_REDIRECT_KEY, currentTime.toString());
    return true;
  }
  
  return false;
}

/**
 * Clears the OpenID redirect tracking flag
 */
export function clearOpenIDRedirectFlag(): void {
  localStorage.removeItem(OPENID_REDIRECT_KEY);
}

/**
 * Gets a cookie value by name
 * @param name The name of the cookie
 * @returns The cookie value or null if not found
 */
export function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    const part = parts.pop();
    if (part) {
      return part.split(';').shift() || null;
    }
  }
  return null;
}

export function clearLocalStorage(skipFirst?: boolean) {
  const keys = Object.keys(localStorage);
  keys.forEach((key) => {
    if (skipFirst === true && key.endsWith('0')) {
      return;
    }
    if (
      key.startsWith(LocalStorageKeys.ASST_ID_PREFIX) ||
      key.startsWith(LocalStorageKeys.AGENT_ID_PREFIX) ||
      key.startsWith(LocalStorageKeys.LAST_CONVO_SETUP) ||
      key === LocalStorageKeys.LAST_SPEC ||
      key === LocalStorageKeys.LAST_TOOLS ||
      key === LocalStorageKeys.LAST_MODEL ||
      key === LocalStorageKeys.FILES_TO_DELETE
    ) {
      localStorage.removeItem(key);
    }
  });
}
