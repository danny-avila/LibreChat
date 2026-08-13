import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const CLERK_PUBLISHABLE_KEY = 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k';
const SAFE_REDIRECT = '/c/new?clerk=closure';

const clerkMockScript = [
  '(function () {',
  '  if (window.__clerkE2E && window.__clerkE2E.clerk) {',
  '    window.Clerk = window.__clerkE2E.clerk;',
  '    return;',
  '  }',
  '  var listeners = new Set();',
  '  var statusListeners = new Set();',
  '  var persistedActiveSession = Number(window.sessionStorage.getItem("clerkE2EActiveSession"));',
  '  var activeSession = null;',
  '  var sessionCounter = Number(window.sessionStorage.getItem("clerkE2ESessionCounter")) || 0;',
  '  var openSignInOptions = null;',
  '  var signOutCalls = [];',
  '  var getTokenCalls = [];',
  '  var user = { id: "clerk-user", organizationMemberships: [] };',
  '  function createSession(currentSessionNumber) {',
  '    return {',
  '      id: "clerk-session-" + currentSessionNumber,',
  '      status: "active",',
  '      lastActiveToken: { jwt: { claims: {} } },',
  '      factorVerificationAge: null,',
  '      actor: null,',
  '      getToken: function (options) {',
  '        getTokenCalls.push(options || null);',
  '        return Promise.resolve("clerk-token-" + currentSessionNumber);',
  '      }',
  '    };',
  '  }',
  '  if (persistedActiveSession > 0) { activeSession = createSession(persistedActiveSession); }',
  '  var lastResources = {',
  '    client: {},',
  '    session: activeSession,',
  '    user: activeSession ? user : null,',
  '    organization: null',
  '  };',
  '  function updateResources() {',
  '    lastResources = {',
  '      client: {},',
  '      session: activeSession,',
  '      user: activeSession ? user : null,',
  '      organization: null',
  '    };',
  '    Array.from(listeners).forEach(function (listener) { listener(lastResources); });',
  '  }',
  '  function closeSignIn() {',
  '    var dialog = document.querySelector("[data-clerk-e2e-modal]");',
  '    if (dialog) { dialog.remove(); }',
  '    document.removeEventListener("keydown", handleEscape);',
  '  }',
  '  function handleEscape(event) {',
  '    if (event.key === "Escape") { closeSignIn(); }',
  '  }',
  '  function completeSignIn() {',
  '    sessionCounter += 1;',
  '    var currentSessionNumber = sessionCounter;',
  '    activeSession = createSession(currentSessionNumber);',
  '    window.sessionStorage.setItem("clerkE2EActiveSession", String(currentSessionNumber));',
  '    window.sessionStorage.setItem("clerkE2ESessionCounter", String(sessionCounter));',
  '    closeSignIn();',
  '    updateResources();',
  '  }',
  '  function button(label, onClick) {',
  '    var element = document.createElement("button");',
  '    element.type = "button";',
  '    element.textContent = label;',
  '    element.addEventListener("click", onClick);',
  '    return element;',
  '  }',
  '  function openSignIn(options) {',
  '    openSignInOptions = options;',
  '    closeSignIn();',
  '    var dialog = document.createElement("div");',
  '    dialog.setAttribute("role", "dialog");',
  '    dialog.setAttribute("aria-label", "Clerk sign in");',
  '    dialog.setAttribute("data-clerk-e2e-modal", "true");',
  '    var existing = button("Complete existing-user sign in", completeSignIn);',
  '    var transfer = button("Create account", function () {',
  '      window.history.replaceState({}, "", window.location.pathname + window.location.search + "#/create");',
  '      dialog.setAttribute("aria-label", "Clerk sign up");',
  '      completeSignUp.hidden = false;',
  '    });',
  '    var completeSignUp = button("Complete new-user sign up", completeSignIn);',
  '    completeSignUp.hidden = true;',
  '    dialog.appendChild(existing);',
  '    dialog.appendChild(transfer);',
  '    dialog.appendChild(completeSignUp);',
  '    document.body.appendChild(dialog);',
  '    document.addEventListener("keydown", handleEscape);',
  '  }',
  '  var clerk = {',
  '    loaded: true,',
  '    status: "ready",',
  '    __internal_updateProps: function () {},',
  '    addListener: function (listener, options) {',
  '      listeners.add(listener);',
  '      if (!options || options.skipInitialEmit !== true) {',
  '        queueMicrotask(function () { listener(lastResources); });',
  '      }',
  '      return function () { listeners.delete(listener); };',
  '    },',
  '    on: function (event, listener, options) {',
  '      if (event === "status") {',
  '        statusListeners.add(listener);',
  '        if (options && options.notify) { listener("ready"); }',
  '      }',
  '      return function () { statusListeners.delete(listener); };',
  '    },',
  '    off: function (event, listener) {',
  '      if (event === "status") { statusListeners.delete(listener); }',
  '    },',
  '    openSignIn: openSignIn,',
  '    closeSignIn: closeSignIn,',
  '    signOut: function (options) {',
  '      signOutCalls.push(options || null);',
  '      window.localStorage.setItem("clerkE2ESignOutCalls", JSON.stringify(signOutCalls));',
  '      activeSession = null;',
  '      window.sessionStorage.removeItem("clerkE2EActiveSession");',
  '      updateResources();',
  '      return Promise.resolve();',
  '    }',
  '  };',
  '  Object.defineProperties(clerk, {',
  '    session: { get: function () { return activeSession; } },',
  '    user: { get: function () { return activeSession ? user : null; } },',
  '    isSignedIn: { get: function () { return Boolean(activeSession); } },',
  '    __internal_lastEmittedResources: { get: function () { return lastResources; } }',
  '  });',
  '  window.__clerkE2E = {',
  '    clerk: clerk,',
  '    get openSignInOptions() { return openSignInOptions; },',
  '    signOutCalls: signOutCalls,',
  '    getTokenCalls: getTokenCalls',
  '  };',
  '  window.Clerk = clerk;',
  '})();',
].join('\n');

const clerkUser = {
  id: 'clerk-local-user',
  _id: 'clerk-local-user',
  email: 'clerk@example.com',
  name: 'Clerk User',
  username: 'clerk-user',
  role: 'USER',
  provider: 'clerk',
};

type ClerkBrowserState = {
  openSignInOptions: Record<string, unknown> | null;
  signOutCalls: Array<{ sessionId?: string } | null>;
  getTokenCalls: Array<{ skipCache?: boolean } | null>;
};

test('Clerk modal exchange retries safely, recovers one replay, and performs dual logout', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(60_000);
  if (typeof baseURL !== 'string') {
    throw new Error('baseURL must be configured for Clerk mock tests');
  }

  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  const clerkRequests: unknown[] = [];
  let clerkLoginCalls = 0;
  let localLogoutCalls = 0;
  let localSessionActive = false;
  let replayRejected = false;
  let startupConfig: Record<string, unknown> | null = null;
  let releaseFirstClerkLogin: (() => void) | undefined;
  const firstClerkLoginGate = new Promise<void>((resolve) => {
    releaseFirstClerkLogin = resolve;
  });

  try {
    await page.addInitScript(() => {
      localStorage.setItem('navVisible', 'true');
    });
    await page.route('**/npm/@clerk/clerk-js**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: clerkMockScript,
      });
    });
    await page.route('**/api/config**', async (route) => {
      if (!startupConfig) {
        const response = await route.fetch();
        startupConfig = {
          ...((await response.json()) as Record<string, unknown>),
          clerkLoginEnabled: true,
          clerkPublishableKey: CLERK_PUBLISHABLE_KEY,
          emailLoginEnabled: false,
          socialLoginEnabled: false,
          socialLogins: [],
        };
      }
      await route.fulfill({ status: 200, contentType: 'application/json', json: startupConfig });
    });
    await page.route('**/api/auth/refresh**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: localSessionActive ? { token: 'local-access-token', user: clerkUser } : {},
      });
    });
    await page.route('**/api/user', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: clerkUser });
    });
    await page.route('**/api/auth/clerk', async (route) => {
      const requestBody: unknown = route.request().postDataJSON();
      clerkLoginCalls += 1;
      clerkRequests.push(requestBody);
      if (clerkLoginCalls === 1) {
        await firstClerkLoginGate;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          json: { code: 'CLERK_UNAVAILABLE' },
        });
        return;
      }
      if (
        !replayRejected &&
        requestBody != null &&
        typeof requestBody === 'object' &&
        'clerkToken' in requestBody &&
        requestBody.clerkToken === 'clerk-token-2'
      ) {
        replayRejected = true;
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          json: { code: 'CLERK_TOKEN_REPLAYED' },
        });
        return;
      }
      localSessionActive = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { token: 'local-access-token', user: clerkUser },
      });
    });
    await page.route('**/api/auth/logout', async (route) => {
      localLogoutCalls += 1;
      localSessionActive = false;
      await route.fulfill({ status: 200, contentType: 'application/json', json: {} });
    });

    await page.goto(`/login?redirect_to=${encodeURIComponent(SAFE_REDIRECT)}`);
    const signIn = page.getByRole('button', { name: 'Continue with Clerk' });
    await expect(signIn).toBeVisible();
    expect(new URL(page.url()).searchParams.get('redirect_to')).toBe(SAFE_REDIRECT);

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="clerk-sign-in-button"]')
      .analyze();
    expect(accessibility.violations).toEqual([]);

    await signIn.click();
    await expect(page.getByRole('dialog', { name: 'Clerk sign in' })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('redirect_to')).toBe(SAFE_REDIRECT);
    const providerOptions = await page.evaluate(
      () =>
        (
          window as Window & {
            __clerkE2E: ClerkBrowserState;
          }
        ).__clerkE2E.openSignInOptions,
    );
    expect(providerOptions).toEqual(
      expect.objectContaining({
        forceRedirectUrl: '/login',
        fallbackRedirectUrl: '/login',
        signUpForceRedirectUrl: '/login',
        signUpFallbackRedirectUrl: '/login',
      }),
    );

    await page.getByRole('button', { name: 'Create account' }).click();
    const signUpTransferUrl = new URL(page.url());
    expect(signUpTransferUrl.pathname).toBe('/login');
    expect(signUpTransferUrl.searchParams.get('redirect_to')).toBe(SAFE_REDIRECT);
    expect(signUpTransferUrl.hash).toBe('#/create');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await signIn.click();
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByRole('button', { name: 'Complete new-user sign up' }).click();
    await expect(page.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    releaseFirstClerkLogin();
    const exchangeError = page
      .getByRole('alert')
      .filter({ hasText: 'Clerk sign in could not be completed.' });
    await expect(exchangeError).toBeVisible();
    await expect(exchangeError).toBeFocused();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    expect(clerkRequests).toEqual([{ clerkToken: 'clerk-token-1' }]);

    await page.getByRole('button', { name: 'Retry' }).click();
    await page.waitForURL(
      (url) => url.pathname === '/c/new' && url.searchParams.get('clerk') === 'closure',
    );
    await expect(page.getByTestId('nav-user')).toBeVisible();
    expect(clerkRequests).toEqual([
      { clerkToken: 'clerk-token-1' },
      { clerkToken: 'clerk-token-1' },
    ]);

    await page.getByTestId('nav-user').click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await page.waitForURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Continue with Clerk' })).toBeVisible();

    const signOutCalls = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('clerkE2ESignOutCalls') ?? '[]'),
    );
    expect(localLogoutCalls).toBe(1);
    expect(signOutCalls).toEqual([{ sessionId: 'clerk-session-1' }]);

    await page.getByRole('button', { name: 'Continue with Clerk' }).click();
    await page.getByRole('button', { name: 'Complete existing-user sign in' }).click();
    await page.waitForURL(/\/c\/new$/);
    await expect(page.getByTestId('nav-user')).toBeVisible();
    expect(clerkRequests.slice(-2)).toEqual([
      { clerkToken: 'clerk-token-2' },
      { clerkToken: 'clerk-token-2' },
    ]);
    const getTokenCalls = await page.evaluate(
      () =>
        (
          window as Window & {
            __clerkE2E: ClerkBrowserState;
          }
        ).__clerkE2E.getTokenCalls,
    );
    expect(getTokenCalls.slice(-2)).toEqual([null, { skipCache: true }]);

    await page.getByTestId('nav-user').click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await page.waitForURL(/\/login$/);
    const requestCountBeforeDirectSuccess = clerkRequests.length;
    const tokenCallCountBeforeDirectSuccess = getTokenCalls.length;
    await page.getByRole('button', { name: 'Continue with Clerk' }).click();
    await page.getByRole('button', { name: 'Complete existing-user sign in' }).click();
    await page.waitForURL(/\/c\/new$/);
    await expect(page.getByTestId('nav-user')).toBeVisible();
    expect(clerkRequests.slice(requestCountBeforeDirectSuccess)).toEqual([
      { clerkToken: 'clerk-token-3' },
    ]);
    const directSuccessTokenCalls = await page.evaluate(
      () =>
        (
          window as Window & {
            __clerkE2E: ClerkBrowserState;
          }
        ).__clerkE2E.getTokenCalls,
    );
    expect(directSuccessTokenCalls.slice(tokenCallCountBeforeDirectSuccess)).toEqual([null]);
    expect(localLogoutCalls).toBe(2);
  } finally {
    releaseFirstClerkLogin?.();
    await context.close();
  }
});
