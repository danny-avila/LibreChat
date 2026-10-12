export const TTS_CACHE_NAME = 'tts-responses';

const TTS_CACHE_PATH = '/tts-cache/';
const TTS_CACHE_KEY = /^\/tts-cache\/[0-9a-f]{64}$/;

/** Bumped when the cache is cleared or a session opens, so a write started before then cannot
 *  land in the cache that follows. */
let sessionEpoch = 0;
/** Shut when a session ends here or in another tab, and reopened only when this tab
 *  authenticates, so a tab still holding the departed session's token cannot write. */
let writesOpen = true;
/** Set when deleting the cache failed, so the next open retries before reading or writing. */
let deletePending = false;
let legacyPurge: Promise<void> | null = null;
let channel: BroadcastChannel | null = null;
let joined = false;

type Notice = 'clear' | 'end';

const onNotice = (notice: string): void => {
  sessionEpoch += 1;
  legacyPurge = null;
  if (notice === 'end') {
    writesOpen = false;
  }
};

/** Tabs share Cache Storage but not this module, so a clear or logout in one tab is announced to
 *  every tab that has joined: each authenticated tab and each tab with a TTS request in flight.
 *  Where BroadcastChannel is unavailable, localStorage storage events carry the notice. */
const join = (): void => {
  if (joined) {
    return;
  }
  joined = true;
  try {
    channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(TTS_CACHE_NAME);
  } catch {
    channel = null;
  }
  if (channel) {
    channel.addEventListener('message', (event: MessageEvent) => onNotice(String(event.data)));
    return;
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === TTS_CACHE_NAME && event.newValue) {
        onNotice(event.newValue.split(':')[0]);
      }
    });
  }
};

const announce = (notice: Notice): void => {
  join();
  if (channel) {
    channel.postMessage(notice);
    return;
  }
  try {
    localStorage.setItem(TTS_CACHE_NAME, `${notice}:${Date.now()}:${Math.random()}`);
  } catch {
    /** Storage is blocked too; this tab can then fence only its own writes. */
  }
};

const deleteCache = async (): Promise<void> => {
  if (typeof caches === 'undefined') {
    return;
  }
  try {
    await caches.delete(TTS_CACHE_NAME);
    deletePending = false;
  } catch {
    deletePending = true;
  }
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
  if (deletePending) {
    await deleteCache();
  }
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
  join();
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

const clear = (notice: Notice): Promise<void> => {
  sessionEpoch += 1;
  legacyPurge = null;
  announce(notice);
  return deleteCache();
};

/** Deletes every cached TTS response. Safe when the Cache API is missing or rejects; a failed
 *  delete is retried by the next open. */
export function clearTTSCache(): Promise<void> {
  return clear('clear');
}

/** Ends caching for the session in every tab and deletes what it cached. */
export function endTTSCacheSession(): Promise<void> {
  writesOpen = false;
  return clear('end');
}

/** Called when this tab authenticates: the new session may cache again, but not audio that a
 *  request started before it returns. */
export function openTTSCacheWrites(): void {
  join();
  sessionEpoch += 1;
  writesOpen = true;
  legacyPurge = null;
}
