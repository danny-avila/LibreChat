/**
 * @jest-environment jsdom
 */
import { readTwoFactorSetupToken, clearTwoFactorSetupToken } from './twoFactor';
import { TWO_FACTOR_ENROLLMENT_REQUIRED_CODE } from './config';
import request from './request';

interface AuthRecoveryWindow extends Window {
  __librechatAuthRecovery?: unknown;
}

const enrollmentBody = {
  code: TWO_FACTOR_ENROLLMENT_REQUIRED_CODE,
  twoFAPending: true,
  twoFASetupRequired: true,
  tempToken: 'setup-token',
};

const blockStorage = () =>
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage blocked');
  });

describe('two-factor enrollment responses outside the interceptors', () => {
  let pushState: jest.SpyInstance;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearTwoFactorSetupToken();
    delete (window as AuthRecoveryWindow).__librechatAuthRecovery;
    window.history.pushState(null, '', '/c/new');
    pushState = jest.spyOn(window.history, 'pushState');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens setup from a parsed enrollment body', () => {
    expect(request.redirectIfTwoFactorSetupPayload(enrollmentBody)).toBe(true);
    expect(readTwoFactorSetupToken()).toBe('setup-token');
  });

  /** Stream transports hand over the raw body, so the helper has to parse it itself. */
  it('opens setup from an enrollment body that arrives as text', () => {
    expect(request.redirectIfTwoFactorSetupPayload(JSON.stringify(enrollmentBody))).toBe(true);
    expect(readTwoFactorSetupToken()).toBe('setup-token');
  });

  it('ignores a 403 body that is not an enrollment response', () => {
    expect(request.redirectIfTwoFactorSetupPayload({ message: 'Forbidden' })).toBe(false);
    expect(readTwoFactorSetupToken()).toBe('');
    expect(pushState).not.toHaveBeenCalled();
  });

  it('ignores a body that is not JSON at all', () => {
    expect(request.redirectIfTwoFactorSetupPayload('<html>gateway</html>')).toBe(false);
    expect(readTwoFactorSetupToken()).toBe('');
    expect(pushState).not.toHaveBeenCalled();
  });

  it('ignores an enrollment body with no usable token', () => {
    expect(request.redirectIfTwoFactorSetupPayload({ ...enrollmentBody, tempToken: '   ' })).toBe(
      false,
    );
    expect(pushState).not.toHaveBeenCalled();
  });

  /**
   * Session storage outlives the document, so the redirect may replace it and clear the app state
   * along the way. Routing in place here would leave that stale state behind.
   */
  it('replaces the document when the token reached durable storage', () => {
    request.redirectIfTwoFactorSetupPayload(enrollmentBody);

    expect(window.sessionStorage.getItem('two_factor_setup_token')).toBe('setup-token');
    expect(pushState).not.toHaveBeenCalled();
  });

  /**
   * With storage blocked the in-memory mirror is the only copy, and replacing the document would
   * destroy it, stranding the setup screen on its expired state with no way back.
   */
  it('keeps the document when only the in-memory mirror holds the token', () => {
    const setItem = blockStorage();

    expect(request.redirectIfTwoFactorSetupPayload(enrollmentBody)).toBe(true);

    setItem.mockRestore();
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/login/2fa/setup');
    expect(readTwoFactorSetupToken()).toBe('setup-token');
  });

  it('redirects once while a redirect is already under way', () => {
    const setItem = blockStorage();

    request.redirectIfTwoFactorSetupPayload(enrollmentBody);
    request.redirectIfTwoFactorSetupPayload(enrollmentBody);

    setItem.mockRestore();
    expect(pushState).toHaveBeenCalledTimes(1);
  });
});
