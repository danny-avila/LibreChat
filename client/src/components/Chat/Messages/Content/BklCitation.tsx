import React, { useState, useCallback, useEffect } from 'react';
import { useMessageContext } from '~/Providers';
import ChunkModal, { type BklSource } from './ChunkModal';

type BklCitationProps = {
  n: number;
};

const BKL_API = '';

const _fetchInflight = new Set<string>();

function extractFileName(metaName: string): string {
  const m = metaName.normalize('NFC').match(/^『(.+?)』/);
  return m ? m[1] : metaName.normalize('NFC');
}

function truncateMiddle(str: string, maxLen = 22): string {
  const s = str.normalize('NFC');
  if (s.length <= maxLen) return s;
  const keepStart = Math.ceil((maxLen - 3) * 0.55);
  const keepEnd = maxLen - 3 - keepStart;
  return s.substring(0, keepStart) + '...' + s.substring(s.length - keepEnd);
}

async function fetchWithRetry(url: string, retries = 2, delayMs = 500): Promise<Response | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return resp;
      if (resp.status === 404 && i < retries - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      return null;
    } catch {
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  return null;
}

const _LS_PREFIX = 'bkl_src_';
const _LS_MAX_ENTRIES = 200;

function _lsKey(messageId: string): string {
  return _LS_PREFIX + messageId;
}

function _pruneLocalStorage(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(_LS_PREFIX)) keys.push(k);
    }
    if (keys.length > _LS_MAX_ENTRIES) {
      keys.slice(0, keys.length - _LS_MAX_ENTRIES).forEach((k) => localStorage.removeItem(k));
    }
  } catch { /* quota or security error — ignore */ }
}

function cacheSources(messageId: string, sources: BklSource[], rid?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  win.__bklSources = win.__bklSources ?? {};
  win.__bklSources[messageId] = sources;
  if (rid) {
    win.__bklSourcesByRid = win.__bklSourcesByRid ?? {};
    win.__bklSourcesByRid[rid] = sources;
  }

  try {
    _pruneLocalStorage();
    const payload = JSON.stringify({ s: sources, r: rid ?? null });
    localStorage.setItem(_lsKey(messageId), payload);
  } catch { /* quota exceeded — in-memory still works */ }
}

function loadSourcesFromStorage(messageId: string): BklSource[] | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  const mem = win.__bklSources?.[messageId];
  if (Array.isArray(mem) && mem.length > 0) return mem;

  try {
    const raw = localStorage.getItem(_lsKey(messageId));
    if (raw) {
      const { s, r } = JSON.parse(raw);
      if (Array.isArray(s) && s.length > 0) {
        win.__bklSources = win.__bklSources ?? {};
        win.__bklSources[messageId] = s;
        if (r) {
          win.__bklSourcesByRid = win.__bklSourcesByRid ?? {};
          win.__bklSourcesByRid[r] = s;
        }
        return s;
      }
    }
  } catch { /* parse error — ignore */ }

  return null;
}

async function fetchSourcesForMessage(messageId: string): Promise<BklSource[] | null> {
  const existing = loadSourcesFromStorage(messageId);
  if (existing) return existing;

  const msgEl = document.getElementById(messageId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  let rid: string | null = msgEl?.getAttribute('data-bkl-rid') ?? null;
  if (!rid) rid = win.__bklRids?.[messageId] ?? null;

  if (rid) {
    const resp = await fetchWithRetry(`${BKL_API}/v1/sources/${rid}`);
    if (resp) {
      try {
        const data = await resp.json();
        const sources = data.sources ?? data;
        if (Array.isArray(sources) && sources.length > 0) {
          cacheSources(messageId, sources, rid);
          return sources;
        }
      } catch { /* fall through */ }
    }
  }

  const latestResp = await fetchWithRetry(`${BKL_API}/v1/sources/latest`);
  if (latestResp) {
    try {
      const data = await latestResp.json();
      const sources: BklSource[] = data.sources ?? data;
      if (Array.isArray(sources) && sources.length > 0) {
        cacheSources(messageId, sources, data.request_id);
        return sources;
      }
    } catch { /* fall through */ }
  }

  return null;
}

function getSourceLabel(messageId: string, n: number): string | null {
  const sources = loadSourcesFromStorage(messageId);
  if (!Array.isArray(sources) || !sources[n - 1]) return null;
  const src = sources[n - 1];
  const name: string = src.metadata?.[0]?.name || src.source?.name || '';
  if (!name) return null;
  const fileName = extractFileName(name);
  return truncateMiddle(fileName);
}

export default function BklCitation({ n }: BklCitationProps) {
  const { messageId } = useMessageContext();
  const [isOpen, setIsOpen] = useState(false);
  const [source, setSource] = useState<BklSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState<string | null>(() => getSourceLabel(messageId, n));

  useEffect(() => {
    if (label) return;
    let cancelled = false;

    const check = () => {
      const l = getSourceLabel(messageId, n);
      if (l && !cancelled) { setLabel(l); return true; }
      return false;
    };

    if (check()) return;

    if (!_fetchInflight.has(messageId)) {
      _fetchInflight.add(messageId);
      fetchSourcesForMessage(messageId).catch(() => {});
    }

    const iv = setInterval(() => { if (check()) clearInterval(iv); }, 400);
    const to = setTimeout(() => clearInterval(iv), 20000);
    return () => { cancelled = true; clearInterval(iv); clearTimeout(to); };
  }, [messageId, n, label]);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cached = (window as any).__bklSources?.[messageId];
      if (Array.isArray(cached) && cached[n - 1]) {
        setSource(cached[n - 1]);
        setIsOpen(true);
        return;
      }

      setLoading(true);
      const sources = await fetchSourcesForMessage(messageId);
      setLoading(false);
      if (sources && sources[n - 1]) {
        setSource(sources[n - 1]);
        if (!label) {
          const l = getSourceLabel(messageId, n);
          if (l) setLabel(l);
        }
      }
      setIsOpen(true);
    },
    [messageId, n, label],
  );

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{ verticalAlign: 'middle' }}
        className={
          label
            ? 'mx-0.5 inline-flex items-center gap-0.5 rounded bg-black/[0.04] px-1.5 py-0.5 text-[11px] leading-none text-gray-900 transition-colors hover:bg-black/[0.08] disabled:opacity-50 dark:bg-white/[0.08] dark:text-gray-100 dark:hover:bg-white/[0.12]'
            : 'mx-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded bg-black/[0.04] px-1 text-[11px] text-gray-900 transition-colors hover:bg-black/[0.08] disabled:opacity-50 dark:bg-white/[0.08] dark:text-gray-100 dark:hover:bg-white/[0.12]'
        }
        title={label ? `${label} [${n}]` : `출처 [${n}] 보기`}
        aria-label={`출처 ${n} 보기`}
      >
        {loading ? (
          '…'
        ) : label ? (
          <>
            <span>『{label}』</span>
            <span>- [{n}]</span>
          </>
        ) : (
          n
        )}
      </button>
      {isOpen && (
        <ChunkModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          source={source}
          citationNumber={n}
        />
      )}
    </>
  );
}
