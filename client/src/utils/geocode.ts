const DEFAULT_ENDPOINT = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

const round = (n: number) => Math.round(n * 100) / 100;

export interface ResolvedLocation {
  place?: string;
  coordinates: { latitude: number; longitude: number };
  timezone?: string;
}

/**
 * Reverse-geocodes coordinates client-side via the configured (CORS) endpoint.
 * Always returns rounded coordinates + timezone; `place` is omitted on failure.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  endpoint: string = DEFAULT_ENDPOINT,
): Promise<ResolvedLocation> {
  const coordinates = { latitude: round(latitude), longitude: round(longitude) };
  let timezone: string | undefined;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timezone = undefined;
  }

  try {
    const url = `${endpoint}?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;
    const response = await fetch(url);
    if (!response.ok) {
      return { coordinates, timezone };
    }
    const data = await response.json();
    const place = [data.city || data.locality, data.principalSubdivision, data.countryName]
      .filter((part: unknown): part is string => typeof part === 'string' && part.length > 0)
      .join(', ');
    return { place: place || undefined, coordinates, timezone };
  } catch {
    return { coordinates, timezone };
  }
}

/**
 * Promisified navigator.geolocation.getCurrentPosition.
 */
export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 600000,
    });
  });
}
