export const TTS_CACHE_NAME = 'tts-responses';

const TTS_CACHE_PATH = '/tts-cache/';
const TTS_CACHE_KEY = /^\/tts-cache\/[0-9a-f]{64}$/;

/** Bumped when a session ends, so a write started before logout cannot repopulate the cache. */
let sessionEpoch = 0;
let legacyPurge: Promise<void> | null = null;
let channel: BroadcastChannel | null | undefined;

/** Tabs share Cache Storage but not this module, so a logout in one tab ends the epoch in every
 *  tab that has a TTS request of its own in flight. */
const getChannel = (): BroadcastChannel | null => {
  if (channel !== undefined) {
    return channel;
  }
  channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(TTS_CACHE_NAME);
  channel?.addEventListener('message', () => {
    sessionEpoch += 1;
  });
  return channel;
};

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

/** Opens the TTS cache. The first open per page load drops entries that earlier versions
 *  keyed by the raw message text. */
export async function openTTSCache(): Promise<Cache> {
  const cache = await caches.open(TTS_CACHE_NAME);
  legacyPurge ??= Promise.resolve()
    .then(() => cache.keys())
    .then((keys) =>
      Promise.all(
        keys
          .filter((key) => !TTS_CACHE_KEY.test(new URL(key.url).pathname))
          .map((key) => cache.delete(key)),
      ),
    )
    .then(
      () => undefined,
      () => undefined,
    );
  await legacyPurge;
  return cache;
}

export const getTTSCacheEpoch = (): number => {
  getChannel();
  return sessionEpoch;
};

/** Best effort: storage can be full or blocked, and that must not fail playback. Skipped when
 *  the session that requested the audio has ended since `epoch` was read. */
export async function putTTSCache(key: string, response: Response, epoch: number): Promise<void> {
  if (epoch !== sessionEpoch) {
    return;
  }
  try {
    const cache = await openTTSCache();
    if (epoch === sessionEpoch) {
      await cache.put(key, response);
    }
  } catch {
    /** Caching is an optimization; the audio has already been delivered. */
  }
}

/** Deletes every cached TTS response. Safe when the Cache API is missing or rejects. */
export async function clearTTSCache(): Promise<void> {
  sessionEpoch += 1;
  getChannel()?.postMessage('clear');
  if (typeof caches === 'undefined') {
    return;
  }
  try {
    await caches.delete(TTS_CACHE_NAME);
  } catch {
    /** Cache storage can be blocked by the browser; nothing more can be cleared. */
  }
}
