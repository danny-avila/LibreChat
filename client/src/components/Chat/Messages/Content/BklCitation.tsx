import React, { useState, useCallback, useEffect } from 'react';
import { useMessageContext } from '~/Providers';
import { useOpenBklSource } from '~/components/Chat/BklPanel/useActiveBklSource';
import { FileTypeIcon } from '~/utils';
import { getFileExtension, stripDisplayExtension } from '~/utils/fileTypeIcon';
import { notifyBklSourcesChanged } from '~/utils/bklSourcesEvent';
import { type BklSource } from './ChunkModal';

type BklCitationProps = {
  n: number;
};

const BKL_API = '/bkl';

const _fetchInflight = new Set<string>();

function extractFileName(metaName: string): string {
  const m = metaName.normalize('NFC').match(/^『(.+?)』/);
  // OCR 파생 `.md` 는 표시에서 제거 (계약서.pdf.md → 계약서.pdf)
  return stripDisplayExtension(m ? m[1] : metaName.normalize('NFC'));
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

function getCachedRequestId(messageId: string): string | null {
  try {
    const raw = localStorage.getItem(_lsKey(messageId));
    if (!raw) return null;
    const { r } = JSON.parse(raw);
    return typeof r === 'string' && r ? r : null;
  } catch {
    return null;
  }
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
  } catch {
    /* quota or security error — ignore */
  }
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
  notifyBklSourcesChanged();

  // Known-empty (e.g. every source was ACL-filtered out) is cached in session
  // memory only: persisting `[]` to localStorage would keep the panel empty
  // forever, even after the user later gains access to the matter.
  if (sources.length === 0) return;

  try {
    _pruneLocalStorage();
    const payload = JSON.stringify({ s: sources, r: rid ?? null });
    localStorage.setItem(_lsKey(messageId), payload);
  } catch {
    /* quota exceeded — in-memory still works */
  }
}

function loadSourcesFromStorage(messageId: string): BklSource[] | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  const mem = win.__bklSources?.[messageId];
  // An empty array is a *definitive* answer ("server said no sources"), not
  // "still loading" — return it so callers stop refetching / spinning.
  if (Array.isArray(mem)) return mem;

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
  } catch {
    /* parse error — ignore */
  }

  return null;
}

async function fetchSourcesForMessage(
  messageId: string,
  { forceRefresh = false }: { forceRefresh?: boolean } = {},
): Promise<BklSource[] | null> {
  const existing = forceRefresh ? null : loadSourcesFromStorage(messageId);
  if (existing) return existing;

  const msgEl = document.getElementById(messageId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  let rid: string | null = msgEl?.getAttribute('data-bkl-rid') ?? null;
  if (!rid) rid = win.__bklRids?.[messageId] ?? null;
  if (!rid) rid = getCachedRequestId(messageId);

  // Tracks a 200 OK response whose sources array was empty (typically every
  // source got ACL-filtered out server-side). That's a definitive "no
  // sources for you" — cache `[]` so the UI shows a message instead of an
  // infinite "출처를 불러오는 중…" spinner. `null` stays reserved for "could
  // not reach the API / not persisted yet" so retries remain possible.
  let sawEmpty = false;

  if (rid) {
    const resp = await fetchWithRetry(`${BKL_API}/v1/sources/${rid}`);
    if (resp) {
      try {
        const data = await resp.json();
        const sources = data.sources ?? data;
        if (Array.isArray(sources)) {
          if (sources.length > 0) {
            cacheSources(messageId, sources, rid);
            return sources;
          }
          sawEmpty = true;
        }
      } catch {
        /* fall through */
      }
    }
  }

  if (messageId) {
    const byMsgResp = await fetchWithRetry(
      `${BKL_API}/v1/sources/by-message/${encodeURIComponent(messageId)}`,
    );
    if (byMsgResp) {
      try {
        const data = await byMsgResp.json();
        const sources: BklSource[] = data.sources ?? data;
        if (Array.isArray(sources)) {
          if (sources.length > 0) {
            cacheSources(messageId, sources, data.request_id);
            if (data.request_id) {
              win.__bklRids = win.__bklRids ?? {};
              win.__bklRids[messageId] = data.request_id;
            }
            return sources;
          }
          sawEmpty = true;
        }
      } catch {
        /* fall through */
      }
    }
  }

  if (sawEmpty) {
    cacheSources(messageId, []);
    return [];
  }

  return null;
}

/**
 * 캐시에 배열은 있는데 요청한 번호 자리만 비어 있는 상태 — 낡은 캐시다.
 *
 * 서버는 스트리밍 *전에* 검색 청크만으로 출처를 한 번 캐시한다. 그 시점에
 * 프론트가 조회하면 DocRead virtual source 가 빠진 짧은 배열을 받아
 * localStorage 에까지 저장한다. 이후 서버가 전문 읽기 결과를 뒤에 덧붙여도
 * 클라이언트 캐시는 낡은 채로 남아 `[56]` 같은 뒤쪽 번호가 영영 안 풀린다.
 * 새로고침하면 localStorage 의 낡은 배열이 다시 살아나 더 끈질기다.
 *
 * 길이가 0 인 배열은 "서버가 출처 없음이라고 답했다" 는 확정 상태라 제외한다
 * (ACL 로 전부 걸러진 경우) — 재조회해봐야 같은 답이다.
 */
function isIndexMissingFromCache(messageId: string, n: number): boolean {
  const sources = loadSourcesFromStorage(messageId);
  return Array.isArray(sources) && sources.length > 0 && !sources[n - 1];
}

/** 낡은 캐시 재조회는 (messageId, n) 당 한 번만 — 실제로 없는 번호를 계속 두드리지 않는다. */
const _staleRefreshed = new Set<string>();

/**
 * 낡은 캐시로 판정되면 강제 재조회를 시작한다. 시작했으면 true.
 *
 * 평소 경로(`fetchSourcesForMessage`)는 캐시가 있으면 그대로 돌려주므로,
 * 이 경우엔 `forceRefresh` 없이는 영원히 같은 배열을 받는다.
 */
function refreshStaleCache(messageId: string, n: number): boolean {
  if (!isIndexMissingFromCache(messageId, n)) return false;
  const key = `${messageId}#${n}`;
  if (_staleRefreshed.has(key)) return false;
  _staleRefreshed.add(key);
  void fetchSourcesForMessage(messageId, { forceRefresh: true }).catch(() => {});
  return true;
}

function getSourceLabel(messageId: string, n: number): string | null {
  const sources = loadSourcesFromStorage(messageId);
  if (!Array.isArray(sources) || !sources[n - 1]) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const src = sources[n - 1] as any;
  const name: string = src.metadata?.[0]?.name || src.source?.name || '';
  if (!name) return null;
  const fileName = extractFileName(name);
  return truncateMiddle(fileName);
}

/**
 * Pull the file type (`pdf`, `msg`, `eml`, …) for citation [n], if known.
 *
 * The backend surfaces `metadata[0].file_type` in PR-C; if that field is
 * missing we fall back to parsing the extension out of the citation header
 * `『...』`. Returns null when sources aren't loaded yet.
 */
function getSourceFileType(messageId: string, n: number): string | null {
  const sources = loadSourcesFromStorage(messageId);
  if (!Array.isArray(sources) || !sources[n - 1]) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const src = sources[n - 1] as any;
  const explicit = src?.metadata?.[0]?.file_type;
  if (explicit && typeof explicit === 'string') return explicit.toLowerCase().replace(/^\./, '');
  const name: string = src?.metadata?.[0]?.name || src?.source?.name || '';
  if (!name) return null;
  // getFileExtension 은 `*.pdf.md` 이중 확장자에서 원본 타입(pdf)을 꺼낸다 —
  // 마지막 토큰만 자르면 전부 `md` 로 오인되던 문제 수정.
  return getFileExtension(extractFileName(name)) || null;
}

export default function BklCitation({ n }: BklCitationProps) {
  const { messageId } = useMessageContext();
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState<string | null>(() => getSourceLabel(messageId, n));
  const [fileType, setFileType] = useState<string | null>(() => getSourceFileType(messageId, n));
  const openSource = useOpenBklSource();

  useEffect(() => {
    if (label) return;
    let cancelled = false;

    const check = () => {
      const l = getSourceLabel(messageId, n);
      if (l && !cancelled) {
        setLabel(l);
        const ft = getSourceFileType(messageId, n);
        if (ft) setFileType(ft);
        return true;
      }
      return false;
    };

    if (check()) return;

    // 낡은 캐시면 강제 재조회가 필요하다 — 평소 경로는 캐시를 그대로 돌려준다.
    // 아래 폴링이 갱신된 배열을 집어간다.
    if (!refreshStaleCache(messageId, n) && !_fetchInflight.has(messageId)) {
      _fetchInflight.add(messageId);
      fetchSourcesForMessage(messageId).catch(() => {});
    }

    const iv = setInterval(() => {
      if (check()) clearInterval(iv);
    }, 400);
    const to = setTimeout(() => clearInterval(iv), 20000);
    return () => {
      cancelled = true;
      clearInterval(iv);
      clearTimeout(to);
    };
  }, [messageId, n, label]);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const cachedSources = loadSourcesFromStorage(messageId);
      let source: BklSource | null =
        Array.isArray(cachedSources) && cachedSources[n - 1] ? cachedSources[n - 1] : null;

      if (!source) {
        setLoading(true);
        // 캐시에 배열은 있는데 이 번호만 비었다면 낡은 캐시다 — 그냥 조회하면
        // 같은 배열을 돌려받으므로 강제로 다시 받아야 한다.
        const stale = Array.isArray(cachedSources) && cachedSources.length > 0;
        const sources = await fetchSourcesForMessage(messageId, { forceRefresh: stale });
        setLoading(false);
        source = sources?.[n - 1] ?? source ?? null;
        if (!label) {
          const l = getSourceLabel(messageId, n);
          if (l) setLabel(l);
        }
      }

      // Web-search style citations: source has a URL but no document body.
      // The user explicitly wanted these to open as plain links rather than
      // showing the drawer, since there is nothing substantive to preview.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const src = source as any;
      const url: string | undefined = src?.source?.url || src?.source?.embed_url;
      const hasBody =
        Array.isArray(src?.document) &&
        typeof src.document[0] === 'string' &&
        src.document[0].trim().length > 0;
      if (url && !hasBody) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }

      openSource(messageId, n);
    },
    [messageId, n, label, openSource],
  );

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      /* Keep the chip on the text baseline, then lower the compact badge
         slightly so it sits inside Korean body text instead of floating above it. */
      style={{ verticalAlign: 'baseline', position: 'relative', top: '0.12em' }}
      className={
        label
          ? 'mx-0.5 inline-flex items-center gap-0.5 rounded bg-black/[0.04] px-1.5 py-px text-[11px] leading-none text-gray-900 transition-colors hover:bg-black/[0.08] disabled:opacity-50 dark:bg-white/[0.08] dark:text-gray-100 dark:hover:bg-white/[0.12]'
          : 'mx-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded bg-black/[0.04] px-1 text-[11px] leading-none text-gray-900 transition-colors hover:bg-black/[0.08] disabled:opacity-50 dark:bg-white/[0.08] dark:text-gray-100 dark:hover:bg-white/[0.12]'
      }
      title={label ? `${label} [${n}]` : `출처 [${n}] 보기`}
      aria-label={`출처 ${n} 보기`}
    >
      {loading ? (
        '…'
      ) : label ? (
        <>
          {fileType ? <FileTypeIcon ext={fileType} className="-ml-0.5 h-3 w-3 shrink-0" /> : null}
          <span>『{label}』</span>
          <span>- [{n}]</span>
        </>
      ) : (
        n
      )}
    </button>
  );
}
