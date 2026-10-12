/** Earlier versions persisted read-aloud audio to Cache Storage under this name, keyed by the
 *  message text. Audio is now held only in this tab's memory, so that cache is just deleted. */
const LEGACY_TTS_CACHE_NAME = 'tts-responses';
const MAX_ENTRIES = 50;
/** Long replies make large recordings, so the cache is bounded by size as well as count. */
const MAX_BYTES = 32 * 1024 * 1024;

/** Spoken audio by hashed key, oldest first; it never leaves this tab and dies with it. */
const audioByKey = new Map<string, Blob>();
let totalBytes = 0;
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

const removeAudio = (key: string): void => {
  const audio = audioByKey.get(key);
  if (audio) {
    totalBytes -= audio.size;
    audioByKey.delete(key);
  }
};

/** Stores audio for a request started at `requestGeneration`; skipped if a clear came since, or
 *  if the recording alone exceeds the size budget. */
export function setCachedTTSAudio(key: string, audio: Blob, requestGeneration: number): void {
  if (requestGeneration !== generation || audio.size > MAX_BYTES) {
    return;
  }
  removeAudio(key);
  audioByKey.set(key, audio);
  totalBytes += audio.size;
  while (audioByKey.size > MAX_ENTRIES || totalBytes > MAX_BYTES) {
    const oldest = audioByKey.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    removeAudio(oldest);
  }
}

/** Drops every cached recording and any audio earlier versions left in Cache Storage. */
export function clearTTSCache(): void {
  audioByKey.clear();
  totalBytes = 0;
  generation += 1;
  if (typeof caches === 'undefined') {
    return;
  }
  void Promise.resolve()
    .then(() => caches.delete(LEGACY_TTS_CACHE_NAME))
    .catch(() => undefined);
}
