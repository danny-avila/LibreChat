import { isNativeIOS } from './mobile/platform';

export const hideAccessoryBar = async (): Promise<void> => {
  if (!isNativeIOS()) {
    return;
  }
  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
  } catch {
    // Ignore if plugin isn't available yet.
  }
};

export const showAccessoryBar = async (): Promise<void> => {
  if (!isNativeIOS()) {
    return;
  }
  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    await Keyboard.setAccessoryBarVisible({ isVisible: true });
  } catch {
    // Ignore if plugin isn't available yet.
  }
};
