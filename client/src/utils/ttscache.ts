/** Earlier versions persisted read-aloud audio to Cache Storage under this name, keyed by the
 *  message text. Audio is now held only in this tab's memory, so that cache is just deleted. */
const LEGACY_TTS_CACHE_NAME = 'tts-responses';
const MAX_ENTRIES = 50;

/** Spoken audio by hashed key, oldest first; it never leaves this tab and dies with it. */
const audioByKey = new Map<string, Blob>();
/** Bumped on every clear, so a request that was in flight across a logout cannot write. */
let generation = 0;

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

/** Returns a SHA-256 hash of the spoken text and voice, so the cache holds no message text.
 *  Returns null when hashing is unavailable (no secure context); the caller skips the cache. */
export async function getTTSCacheKey(text: string, voice?: string | null): Promise<string | null> {
  if (!text || typeof crypto === 'undefined' || !crypto.subtle) {
    return null;
  }
  try {
    const data = new TextEncoder().encode(JSON.stringify([voice ?? '', text]));
    return toHex(await crypto.subtle.digest('SHA-256', data));
  } catch {
    return null;
  }
}

export const getTTSCacheGeneration = (): number => generation;

export const hasCachedTTSAudio = (): boolean => audioByKey.size > 0;

export function getCachedTTSAudio(key: string): Blob | undefined {
  const audio = audioByKey.get(key);
  if (audio) {
    /** Most recently played stays last, so eviction drops the least recently used. */
    audioByKey.delete(key);
    audioByKey.set(key, audio);
  }
  return audio;
}

/** Stores audio for a request started at `requestGeneration`; skipped if a clear came since. */
export function setCachedTTSAudio(key: string, audio: Blob, requestGeneration: number): void {
  if (requestGeneration !== generation) {
    return;
  }
  audioByKey.delete(key);
  audioByKey.set(key, audio);
  while (audioByKey.size > MAX_ENTRIES) {
    const oldest = audioByKey.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    audioByKey.delete(oldest);
  }
}

/** Drops every cached recording and any audio earlier versions left in Cache Storage. */
export function clearTTSCache(): void {
  audioByKey.clear();
  generation += 1;
  if (typeof caches === 'undefined') {
    return;
  }
  void Promise.resolve()
    .then(() => caches.delete(LEGACY_TTS_CACHE_NAME))
    .catch(() => undefined);
}
