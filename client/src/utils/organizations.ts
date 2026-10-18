import { LocalStorageKeys, ORGANIZATION_ONBOARDING_REQUIRED_CODE } from 'librechat-data-provider';
import { clearLocalStorage } from './localStorage';
import { loadAppPath } from './navigation';

const ONBOARDING_TOKEN_KEY = 'librechat:organizationOnboardingToken';
const ONBOARDING_UNVERIFIED_KEY = 'librechat:organizationOnboardingUnverified';
const PENDING_INVITE_KEY = 'librechat:pendingOrganizationInvite';
const SESSION_CHANNEL = 'librechat:organization-session';

/** Keys `clearLocalStorage` leaves that still name another organization's agents, tools or
 *  prompts: toggles and pins hold ids that mean nothing (or something else) elsewhere. */
const ORGANIZATION_SCOPED_PREFIXES = [
  LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_,
  LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_,
  LocalStorageKeys.LAST_ARTIFACTS_TOGGLE_,
  LocalStorageKeys.LAST_SKILLS_TOGGLE_,
  LocalStorageKeys.PIN_MCP_,
  LocalStorageKeys.PIN_WEB_SEARCH_,
  LocalStorageKeys.PIN_CODE_INTERPRETER_,
];
const ORGANIZATION_SCOPED_KEYS = [
  LocalStorageKeys.LAST_AGENT_PROVIDER,
  LocalStorageKeys.LAST_AGENT_MODEL,
  LocalStorageKeys.LAST_PROMPT_CATEGORY,
];

function readSession(key: string): string | undefined {
  try {
    return sessionStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeSession(key: string, value: string | undefined): void {
  try {
    if (value) {
      sessionStorage.setItem(key, value);
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    /* Storage blocked: the flow continues without remembering it across a reload. */
  }
}

/** The short-lived token an account with no organization signs in with. */
export const persistOnboardingToken = (token: string) => writeSession(ONBOARDING_TOKEN_KEY, token);
export const getOnboardingToken = () => readSession(ONBOARDING_TOKEN_KEY);
export const clearOnboardingToken = () => {
  writeSession(ONBOARDING_TOKEN_KEY, undefined);
  writeSession(ONBOARDING_UNVERIFIED_KEY, undefined);
};
/** Whether the account being onboarded has yet to verify its email, so cannot create one. */
export const isOnboardingEmailUnverified = () => readSession(ONBOARDING_UNVERIFIED_KEY) === 'true';

/** An invite link opened before signing in, accepted once the person has signed in. */
export const persistPendingInviteToken = (token: string) => writeSession(PENDING_INVITE_KEY, token);
export const getPendingInviteToken = () => readSession(PENDING_INVITE_KEY);
export const clearPendingInviteToken = () => writeSession(PENDING_INVITE_KEY, undefined);

/** Drops everything this browser remembers that belongs to the organization being left. */
export function clearOrganizationScopedStorage(): void {
  clearLocalStorage();
  try {
    Object.keys(localStorage).forEach((key) => {
      if (
        ORGANIZATION_SCOPED_KEYS.includes(key as LocalStorageKeys) ||
        ORGANIZATION_SCOPED_PREFIXES.some((prefix) => key.startsWith(prefix))
      ) {
        localStorage.removeItem(key);
      }
    });
  } catch {
    /* Storage blocked: nothing was persisted to leak. */
  }
}

function openChannel(): BroadcastChannel | undefined {
  try {
    return typeof BroadcastChannel === 'undefined'
      ? undefined
      : new BroadcastChannel(SESSION_CHANNEL);
  } catch {
    return undefined;
  }
}

/** Calls `handler` when another tab moves this browser's session to a different organization. */
export function onOrganizationSessionChanged(handler: (tenantId: string) => void): () => void {
  const channel = openChannel();
  if (!channel) {
    return () => undefined;
  }
  channel.onmessage = (event: MessageEvent<{ tenantId?: unknown }>) => {
    if (typeof event.data?.tenantId === 'string') {
      handler(event.data.tenantId);
    }
  };
  return () => channel.close();
}

/**
 * Finishes entering an organization session the server has just issued (create, switch, or
 * accept): forgets what this browser held for the previous organization, tells other tabs so
 * they reload too, and loads the app fresh, which discards every in-memory query and store.
 */
export function enterOrganizationSession(tenantId: string, path = '/c/new'): void {
  clearOrganizationScopedStorage();
  clearOnboardingToken();
  clearPendingInviteToken();
  const channel = openChannel();
  channel?.postMessage({ tenantId });
  channel?.close();
  loadAppPath(path);
}

/**
 * Sends an account that belongs to no organization yet to onboarding, given any sign-in
 * response; returns whether it did. The token rides in session storage, never the URL.
 */
export function startOrganizationOnboarding(result: {
  code?: string;
  onboardingToken?: string;
  emailVerified?: boolean;
}): boolean {
  if (result.code !== ORGANIZATION_ONBOARDING_REQUIRED_CODE || !result.onboardingToken) {
    return false;
  }
  persistOnboardingToken(result.onboardingToken);
  writeSession(ONBOARDING_UNVERIFIED_KEY, result.emailVerified === false ? 'true' : undefined);
  loadAppPath('/onboarding');
  return true;
}
