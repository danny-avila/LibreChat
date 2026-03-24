type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

export const isNativeIOS = () => {
  const capacitor = (globalThis as typeof globalThis & { Capacitor?: CapacitorRuntime }).Capacitor;
  return (capacitor?.isNativePlatform?.() ?? false) && capacitor?.getPlatform?.() === 'ios';
};
