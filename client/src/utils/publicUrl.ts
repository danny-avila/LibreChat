import { isNativePlatform } from './nativeAuth';

const DEFAULT_PUBLIC_ORIGIN = 'https://app.codecan.ai';

export function getPublicOrigin(): string {
  const envOrigin = import.meta.env?.VITE_PUBLIC_URL as string | undefined;
  if (envOrigin) {
    return envOrigin.replace(/\/$/, '');
  }
  if (isNativePlatform() || !/^https?:$/i.test(window.location.protocol)) {
    return DEFAULT_PUBLIC_ORIGIN;
  }
  return `${window.location.protocol}//${window.location.host}`;
}

export function buildShareLink(shareId: string): string {
  return `${getPublicOrigin()}/share/${shareId}`;
}
