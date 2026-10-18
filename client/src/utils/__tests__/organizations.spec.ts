import { LocalStorageKeys, ORGANIZATION_ONBOARDING_REQUIRED_CODE } from 'librechat-data-provider';
import {
  getOnboardingToken,
  clearOnboardingToken,
  isOnboardingEmailUnverified,
  getPendingInviteToken,
  persistOnboardingToken,
  persistPendingInviteToken,
  enterOrganizationSession,
  startOrganizationOnboarding,
  onOrganizationSessionChanged,
  clearOrganizationScopedStorage,
} from '../organizations';
import { loadAppPath } from '../navigation';

jest.mock('../navigation', () => ({ loadAppPath: jest.fn() }));

class FakeChannel {
  static channels: FakeChannel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(public name: string) {
    FakeChannel.channels.push(this);
  }

  postMessage(data: unknown) {
    FakeChannel.channels
      .filter((channel) => channel !== this && channel.name === this.name)
      .forEach((channel) => channel.onmessage?.({ data } as MessageEvent));
  }

  close() {
    FakeChannel.channels = FakeChannel.channels.filter((channel) => channel !== this);
  }
}

const assign = loadAppPath as jest.MockedFunction<typeof loadAppPath>;

beforeAll(() => {
  Object.defineProperty(window, 'BroadcastChannel', { value: FakeChannel, configurable: true });
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  assign.mockClear();
  FakeChannel.channels = [];
});

describe('clearOrganizationScopedStorage', () => {
  it('drops what names the previous organization and keeps device preferences', () => {
    localStorage.setItem(LocalStorageKeys.LAST_MODEL, '{"openAI":"gpt"}');
    localStorage.setItem(`${LocalStorageKeys.AGENT_ID_PREFIX}0`, 'agent_a');
    localStorage.setItem(`${LocalStorageKeys.TEXT_DRAFT}convo`, 'draft');
    localStorage.setItem(`${LocalStorageKeys.PIN_MCP_}0`, 'true');
    localStorage.setItem(`${LocalStorageKeys.LAST_SKILLS_TOGGLE_}0`, 'true');
    localStorage.setItem(LocalStorageKeys.LAST_AGENT_MODEL, 'gpt');
    localStorage.setItem(LocalStorageKeys.LAST_PROMPT_CATEGORY, 'dev');
    localStorage.setItem('theme', 'dark');

    clearOrganizationScopedStorage();

    expect(Object.keys(localStorage)).toEqual(['theme']);
  });
});

describe('enterOrganizationSession', () => {
  it('forgets the previous organization, tells other tabs, and loads the app fresh', () => {
    const changed = jest.fn();
    onOrganizationSessionChanged(changed);
    localStorage.setItem(LocalStorageKeys.LAST_MODEL, 'x');
    persistOnboardingToken('onboarding');
    persistPendingInviteToken('invite');

    enterOrganizationSession('org_b');

    expect(changed).toHaveBeenCalledWith('org_b');
    expect(localStorage.getItem(LocalStorageKeys.LAST_MODEL)).toBeNull();
    expect(getOnboardingToken()).toBeUndefined();
    expect(getPendingInviteToken()).toBeUndefined();
    expect(assign).toHaveBeenCalledWith('/c/new');
  });
});

describe('startOrganizationOnboarding', () => {
  it('sends an account with no organization to onboarding with its token', () => {
    expect(
      startOrganizationOnboarding({
        code: ORGANIZATION_ONBOARDING_REQUIRED_CODE,
        onboardingToken: 'token-1',
      }),
    ).toBe(true);

    expect(getOnboardingToken()).toBe('token-1');
    expect(isOnboardingEmailUnverified()).toBe(false);
    expect(assign).toHaveBeenCalledWith('/onboarding');
  });

  it('remembers an unverified email until onboarding ends', () => {
    startOrganizationOnboarding({
      code: ORGANIZATION_ONBOARDING_REQUIRED_CODE,
      onboardingToken: 'token-1',
      emailVerified: false,
    });
    expect(isOnboardingEmailUnverified()).toBe(true);

    clearOnboardingToken();
    expect(isOnboardingEmailUnverified()).toBe(false);
    expect(getOnboardingToken()).toBeUndefined();
  });

  it('leaves any other sign-in response alone', () => {
    expect(startOrganizationOnboarding({ code: 'TWO_FACTOR_ENROLLMENT_REQUIRED' })).toBe(false);
    expect(startOrganizationOnboarding({ code: ORGANIZATION_ONBOARDING_REQUIRED_CODE })).toBe(
      false,
    );
    expect(assign).not.toHaveBeenCalled();
  });
});
