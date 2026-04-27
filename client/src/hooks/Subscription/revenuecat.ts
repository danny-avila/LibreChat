import { Capacitor } from '@capacitor/core';

const importModule = async <T = any>(moduleName: string): Promise<T | null> => {
  try {
    const dynamicImport = new Function('name', 'return import(/* @vite-ignore */ name);') as (
      name: string,
    ) => Promise<T>;
    return await dynamicImport(moduleName);
  } catch (error) {
    console.warn(`[RevenueCat] Failed to load ${moduleName}`, error);
    return null;
  }
};

export const isNativePlatform = () => Capacitor.isNativePlatform?.() ?? false;

export const getNativePlatform = () => Capacitor.getPlatform?.() ?? 'web';

export const loadPurchasesModule = () => {
  if (!isNativePlatform()) {
    return Promise.resolve(null);
  }
  return importModule('@revenuecat/purchases-capacitor');
};

export const loadPurchasesUiModule = () => {
  if (!isNativePlatform()) {
    return Promise.resolve(null);
  }
  return importModule('@revenuecat/purchases-capacitor-ui');
};

export const getRevenueCatPublicSdkKey = (
  startupConfig?: Record<string, any> | null,
): string | null => {
  const platform = getNativePlatform();
  const subscriptionConfig = startupConfig?.subscription;
  const publicSdkKeys = subscriptionConfig?.publicSdkKeys;

  if (publicSdkKeys && typeof publicSdkKeys === 'object') {
    if (typeof publicSdkKeys[platform] === 'string' && publicSdkKeys[platform]) {
      return publicSdkKeys[platform];
    }
  }

  const env = import.meta.env;
  if (platform === 'ios') {
    return (
      env.VITE_REVENUECAT_PUBLIC_SDK_KEY_IOS ??
      env.VITE_REVENUECAT_APPLE_PUBLIC_SDK_KEY ??
      env.VITE_REVENUECAT_PUBLIC_SDK_KEY ??
      null
    );
  }

  if (platform === 'android') {
    return (
      env.VITE_REVENUECAT_PUBLIC_SDK_KEY_ANDROID ??
      env.VITE_REVENUECAT_GOOGLE_PUBLIC_SDK_KEY ??
      env.VITE_REVENUECAT_PUBLIC_SDK_KEY ??
      null
    );
  }

  return null;
};
