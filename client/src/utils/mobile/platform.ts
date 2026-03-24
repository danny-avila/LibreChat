import { Capacitor } from '@capacitor/core';

export const isNativeIOS = () =>
  (Capacitor.isNativePlatform?.() ?? false) && Capacitor.getPlatform?.() === 'ios';
