import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

const isIOSNative = () =>
  (Capacitor.isNativePlatform?.() ?? false) && Capacitor.getPlatform?.() === 'ios';

export const hideAccessoryBar = async (): Promise<void> => {
  if (!isIOSNative()) {
    return;
  }
  try {
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
  } catch {
    // Ignore if plugin isn't available yet.
  }
};

export const showAccessoryBar = async (): Promise<void> => {
  if (!isIOSNative()) {
    return;
  }
  try {
    await Keyboard.setAccessoryBarVisible({ isVisible: true });
  } catch {
    // Ignore if plugin isn't available yet.
  }
};
