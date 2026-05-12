import { Capacitor } from '@capacitor/core';
import * as PurchasesCapacitor from '@revenuecat/purchases-capacitor';
import * as PurchasesCapacitorUi from '@revenuecat/purchases-capacitor-ui';

export const isNativePlatform = () => Capacitor.isNativePlatform?.() ?? false;

export const getNativePlatform = () => Capacitor.getPlatform?.() ?? 'web';

export const loadPurchasesModule = async () => (isNativePlatform() ? PurchasesCapacitor : null);

export const loadPurchasesUiModule = async () => (isNativePlatform() ? PurchasesCapacitorUi : null);

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
