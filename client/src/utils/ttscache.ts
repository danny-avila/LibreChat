export const TTS_CACHE_NAME = 'tts-responses';

const TTS_CACHE_PATH = '/tts-cache/';

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

/** Returns a request URL derived from a SHA-256 hash of the spoken text and voice, so the
 *  cache never stores message text. Returns null when hashing is unavailable (no secure
 *  context), in which case the caller must skip the cache. */
export async function getTTSCacheKey(text: string, voice?: string | null): Promise<string | null> {
  if (!text || typeof crypto === 'undefined' || !crypto.subtle) {
    return null;
  }
  try {
    const data = new TextEncoder().encode(JSON.stringify([voice ?? '', text]));
    return `${TTS_CACHE_PATH}${toHex(await crypto.subtle.digest('SHA-256', data))}`;
  } catch {
    return null;
  }
}

/** Deletes every cached TTS response. Safe when the Cache API is missing or rejects. */
export async function clearTTSCache(): Promise<void> {
  if (typeof caches === 'undefined') {
    return;
  }
  try {
    await caches.delete(TTS_CACHE_NAME);
  } catch {
    /** Cache storage can be blocked by the browser; nothing more can be cleared. */
  }
}
