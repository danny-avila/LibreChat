export const TTS_CACHE_NAME = 'tts-responses-v1';

/** Earlier versions keyed this cache by the raw message text, and a tab still running one can
 *  keep writing to it, so it is never read and is deleted whole on every open and clear. */
const LEGACY_TTS_CACHE_NAME = 'tts-responses';
const TTS_CACHE_PATH = '/tts-cache/v1/';

/** Bumped when the cache is cleared or a session opens, so a write started before then cannot
 *  land in the cache that follows. */
let sessionEpoch = 0;
/** Shut when a session ends here or in another tab, and reopened only when this tab
 *  authenticates, so a tab still holding the departed session's token cannot read or write. */
let writesOpen = true;
/** Set before a delete starts and cleared only when it succeeds; the cache is not opened while it
 *  is set. Also recorded as an empty marker cache, which persists wherever the audio cache does,
 *  so a delete cut short by navigation (an IdP logout redirect) or still running in another tab
 *  is finished before any document reads the cache. */
const DELETE_PENDING_CACHE = `${TTS_CACHE_NAME}:pending`;
let deletePending = false;
let channel: BroadcastChannel | null = null;
let joined = false;

type Notice = 'clear' | 'end';

const onNotice = (notice: string): void => {
  sessionEpoch += 1;
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

const isDeletePending = async (): Promise<boolean> => {
  if (deletePending) {
    return true;
  }
  try {
    return await caches.has(DELETE_PENDING_CACHE);
  } catch {
    return false;
  }
};

const deleteCache = async (): Promise<void> => {
  if (typeof caches === 'undefined') {
    return;
  }
  deletePending = true;
  try {
    await caches.open(DELETE_PENDING_CACHE);
  } catch {
    /** The in-memory flag still fences this document. */
  }
  try {
    await Promise.all([caches.delete(TTS_CACHE_NAME), caches.delete(LEGACY_TTS_CACHE_NAME)]);
  } catch {
    /** Stays pending: the next open, in any document, retries before reading or writing. */
    return;
  }
  deletePending = false;
  /** A marker left behind only costs one more delete on the next open. */
  void Promise.resolve()
    .then(() => caches.delete(DELETE_PENDING_CACHE))
    .catch(() => undefined);
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

/** Opens the TTS cache, deleting the legacy raw-text cache first. Rejects while a failed delete
 *  is still pending, so callers fall back to uncached audio rather than read a departed
 *  session's entries. */
export async function openTTSCache(): Promise<Cache> {
  if (await isDeletePending()) {
    await deleteCache();
    if (deletePending) {
      throw new Error('TTS cache unavailable until it is cleared');
    }
  }
  try {
    await caches.delete(LEGACY_TTS_CACHE_NAME);
  } catch {
    /** The legacy cache is never read, so failing to drop it only delays its removal. */
  }
  return caches.open(TTS_CACHE_NAME);
}

/** Reads cached audio for the current session. A tab whose session has ended reads nothing, and
 *  a lookup that a clear or session change overtakes, before or while its body is read, is a
 *  miss, as is any failure. */
export async function matchTTSCache(key: string): Promise<Blob | undefined> {
  const epoch = getTTSCacheEpoch();
  if (!writesOpen) {
    return undefined;
  }
  try {
    const response = await (await openTTSCache()).match(key);
    const audio = await response?.blob();
    return writesOpen && epoch === sessionEpoch ? audio : undefined;
  } catch {
    return undefined;
  }
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
  announce(notice);
  return deleteCache();
};

/** Deletes every cached TTS response. Safe when the Cache API is missing or rejects; a failed
 *  delete keeps the cache closed until a later attempt succeeds. */
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
  if (typeof caches !== 'undefined') {
    /** A restored session may never look anything up; drop the raw-text cache now regardless. */
    void Promise.resolve()
      .then(() => caches.delete(LEGACY_TTS_CACHE_NAME))
      .catch(() => undefined);
  }
}
