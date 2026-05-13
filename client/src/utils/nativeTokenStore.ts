import { Capacitor } from '@capacitor/core';

/**
 * Wraps Capacitor Preferences for the native refresh token. On iOS this is
 * backed by UserDefaults (per-app, persisted across launches). Web callers
 * are no-ops — the existing cookie-based refresh flow handles them.
 *
 * IMPORTANT: never return the Preferences plugin proxy from an async function.
 * Capacitor's plugin proxy traps EVERY property access, including `then`, so
 * `Promise.resolve(Preferences)` thinks it's a thenable and triggers
 * `Preferences.then(...)` against the bridge — which fails with
 * "Preferences.then() is not implemented on ios". Return the module namespace
 * object instead and destructure at the call site.
 */

const REFRESH_TOKEN_KEY = 'codecan_native_refresh_token';

let cached: string | null = null;
let warmed = false;
let prefsModulePromise: Promise<typeof import('@capacitor/preferences')> | null = null;

const isNative = () => Capacitor.isNativePlatform?.() ?? false;

const loadPrefsModule = () => {
  if (!isNative()) {
    return null;
  }
  if (!prefsModulePromise) {
    prefsModulePromise = import('@capacitor/preferences');
  }
  return prefsModulePromise;
};

export const readNativeRefreshToken = async (): Promise<string | null> => {
  if (!isNative()) {
    return null;
  }
  if (warmed) {
    return cached;
  }
  const modulePromise = loadPrefsModule();
  if (!modulePromise) {
    return null;
  }
  const { Preferences } = await modulePromise;
  const { value } = await Preferences.get({ key: REFRESH_TOKEN_KEY });
  cached = value ?? null;
  warmed = true;
  return cached;
};

export const writeNativeRefreshToken = async (token: string | null | undefined): Promise<void> => {
  if (!isNative()) {
    return;
  }
  const modulePromise = loadPrefsModule();
  if (!modulePromise) {
    return;
  }
  const { Preferences } = await modulePromise;
  if (token) {
    await Preferences.set({ key: REFRESH_TOKEN_KEY, value: token });
    cached = token;
  } else {
    await Preferences.remove({ key: REFRESH_TOKEN_KEY });
    cached = null;
  }
  warmed = true;
};

export const clearNativeRefreshToken = async (): Promise<void> => {
  await writeNativeRefreshToken(null);
};
