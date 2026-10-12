export const TTS_CACHE_NAME = 'tts-responses';

const TTS_CACHE_PATH = '/tts-cache/';
const TTS_CACHE_KEY = /^\/tts-cache\/[0-9a-f]{64}$/;

/** Bumped when the cache is cleared, so a write started before then cannot repopulate it. */
let sessionEpoch = 0;
/** Shut when a session ends here or in another tab, and reopened only when this tab
 *  authenticates, so a tab still holding the departed session's token cannot write. */
let writesOpen = true;
let legacyPurge: Promise<void> | null = null;
let channel: BroadcastChannel | null | undefined;

/** Tabs share Cache Storage but not this module, so a logout in one tab ends writes in every
 *  tab that has joined: each authenticated tab and each tab with a TTS request in flight. */
const getChannel = (): BroadcastChannel | null => {
  if (channel !== undefined) {
    return channel;
  }
  try {
    channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(TTS_CACHE_NAME);
  } catch {
    /** An opaque origin cannot open a channel; this tab then fences only its own writes. */
    channel = null;
  }
  channel?.addEventListener('message', (event: MessageEvent) => {
    sessionEpoch += 1;
    legacyPurge = null;
    if (event.data === 'end') {
      writesOpen = false;
    }
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

/** Opens the TTS cache. The first open per page load, and after every clear or sign-in, drops
 *  entries that earlier versions keyed by the raw message text: a tab still running such a
 *  version can write them back after a clear. */
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
      () => {
        /** Storage may recover; the next open retries rather than leaving raw keys behind. */
        legacyPurge = null;
      },
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
  if (!writesOpen || epoch !== sessionEpoch) {
    return;
  }
  try {
    const cache = await openTTSCache();
    if (writesOpen && epoch === sessionEpoch) {
      await cache.put(key, response);
    }
  } catch {
    /** Caching is an optimization; the audio has already been delivered. */
  }
}

/** Deletes every cached TTS response. Safe when the Cache API is missing or rejects. */
export async function clearTTSCache(): Promise<void> {
  sessionEpoch += 1;
  legacyPurge = null;
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

/** Ends caching for the session in every tab and deletes what it cached. */
export function endTTSCacheSession(): Promise<void> {
  writesOpen = false;
  getChannel()?.postMessage('end');
  return clearTTSCache();
}

/** Called when this tab authenticates: the new session may cache again. */
export function openTTSCacheWrites(): void {
  getChannel();
  writesOpen = true;
  legacyPurge = null;
}
