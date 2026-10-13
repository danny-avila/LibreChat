import { useEffect, useMemo, useState } from 'react';
import type { TMessage } from 'librechat-data-provider';
import { BKL_SOURCES_EVENT } from '~/utils/bklSourcesEvent';
import { stripDisplayExtension } from '~/utils/fileTypeIcon';
import { extractBklRidFromMessage } from '~/utils/bklFilter';
import type { BklSource } from './ChunkModal';

/**
 * 답변 끝 "검색 문서 리스트" 표의 『파일명』을 iManage 링크로 바꾸기 위한
 * 파일명 → URL 조회.
 *
 * 스트리밍 경로에서는 백엔드가 본문을 그대로 흘려보내고, 링크 매핑은
 * `GET /bkl/v1/hyperlinks/{rid}` 로 따로 준다 (LibreChat agents SSE 가
 * custom `hyperlinks` 이벤트를 버리므로 REST). 매핑에 빠진 파일은 우측
 * 패널이 쓰는 출처 캐시(window.__bklSources)의 imanage URL 로 보완한다 —
 * 두 경로 모두 PG `document_tags` 의 `imanage_preview_url` 이 원천이다.
 */

type HyperlinkMap = ReadonlyMap<string, string>;

type HyperlinksResponse = { mapping?: Record<string, unknown> };

type BklWindow = Window & {
  __bklRids?: Record<string, string>;
  __bklSources?: Record<string, BklSource[]>;
};

const BKL_API = '/bkl';
const RID_RE = /<!--\s*bkl_rid:([A-Za-z0-9_-]+)\s*-->/;
const MD_LINK_RE = /^\[(?:『)?([^』\]]+)(?:』)?\]\((.+)\)$/;
/** 『파일명』 — 이미 링크 텍스트인 경우( `[『…』](` )는 치환하지 않는다. */
const FILE_MENTION_RE = /『([^『』\n]+)』/g;
/** 답변 저장 직후 매핑이 아직 PG 에 없을 수 있어 나눠 시도한다. */
const FETCH_RETRY_DELAYS_MS = [0, 1500, 4000];

const ridMapCache = new Map<string, HyperlinkMap | null>();
const ridMapInflight = new Map<string, Promise<HyperlinkMap | null>>();

/** 표기 차이(NFC/NFD, 공백, OCR 파생 `.md`)를 접어 비교 키를 만든다. */
export function normalizeFileKey(name: string): string {
  return stripDisplayExtension(name.normalize('NFC').trim()).toLowerCase();
}

function stripBrackets(name: string): string {
  const m = name.normalize('NFC').match(/『(.+?)』/);
  return (m ? m[1] : name).trim();
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) && !value.includes('|');
}

function urlFromMappingValue(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const link = value.match(MD_LINK_RE);
  const url = (link ? link[2] : value).trim();
  return isHttpUrl(url) ? url : null;
}

function parseHyperlinksResponse(json: HyperlinksResponse | null): HyperlinkMap | null {
  const mapping = json?.mapping;
  if (!mapping || typeof mapping !== 'object') return null;
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(mapping)) {
    const url = urlFromMappingValue(value);
    if (!url) continue;
    out.set(normalizeFileKey(stripBrackets(key)), url);
  }
  return out.size > 0 ? out : null;
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

async function fetchHyperlinkMap(rid: string): Promise<HyperlinkMap | null> {
  for (let i = 0; i < FETCH_RETRY_DELAYS_MS.length; i++) {
    if (FETCH_RETRY_DELAYS_MS[i] > 0) await sleep(FETCH_RETRY_DELAYS_MS[i]);
    try {
      const resp = await fetch(`${BKL_API}/v1/hyperlinks/${encodeURIComponent(rid)}`);
      if (resp.ok) return parseHyperlinksResponse((await resp.json()) as HyperlinksResponse);
      if (resp.status !== 404) return null;
    } catch {
      /* 네트워크 오류 — 다음 시도 */
    }
  }
  return null;
}

function loadHyperlinkMap(rid: string): Promise<HyperlinkMap | null> {
  if (ridMapCache.has(rid)) return Promise.resolve(ridMapCache.get(rid) ?? null);
  const pending = ridMapInflight.get(rid);
  if (pending) return pending;
  const request = fetchHyperlinkMap(rid)
    .then((map) => {
      ridMapCache.set(rid, map);
      return map;
    })
    .finally(() => ridMapInflight.delete(rid));
  ridMapInflight.set(rid, request);
  return request;
}

function sourceImanageUrl(source: BklSource): string | null {
  const meta = source.metadata?.[0] as Record<string, unknown> | undefined;
  const candidates = [
    source.source?.imanage_url,
    source.source?.imanage_preview_url,
    meta?.imanage_url,
    meta?.imanage_preview_url,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && isHttpUrl(c)) return c;
  }
  return null;
}

function sourceFileName(source: BklSource): string | null {
  const meta = source.metadata?.[0];
  const raw = meta?.name ?? meta?.file_name;
  return typeof raw === 'string' && raw ? stripBrackets(raw) : null;
}

/** 출처 캐시에서 파일명 → iManage URL. 캐시가 없으면 null. */
export function hyperlinkMapFromSources(sources: BklSource[] | undefined): HyperlinkMap | null {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  const out = new Map<string, string>();
  for (const source of sources) {
    const name = sourceFileName(source);
    if (!name) continue;
    const key = normalizeFileKey(name);
    if (out.has(key)) continue;
    const url = sourceImanageUrl(source);
    if (url) out.set(key, url);
  }
  return out.size > 0 ? out : null;
}

function resolveRid(messageId: string, text: string, message?: TMessage): string | null {
  const fromText = text.match(RID_RE)?.[1];
  if (fromText) return fromText;
  const fromMessage = extractBklRidFromMessage(message);
  if (fromMessage) return fromMessage;
  const win = window as BklWindow;
  return win.__bklRids?.[messageId] ?? null;
}

function mergeMaps(
  primary: HyperlinkMap | null,
  secondary: HyperlinkMap | null,
): HyperlinkMap | null {
  if (!primary) return secondary;
  if (!secondary) return primary;
  const out = new Map(secondary);
  for (const [k, v] of primary) out.set(k, v);
  return out;
}

/**
 * 본문의 『파일명』을 `[『파일명』](<url>)` 마크다운 링크로 바꾼다.
 *
 * 이미 링크 텍스트인 자리(딥씽킹 경로는 서버가 미리 링크를 박는다)는 건너뛴다.
 * URL 은 `<…>` 로 감싸 공백·괄호가 있어도 링크가 깨지지 않게 한다.
 */
export function applyBklAnswerHyperlinks(text: string, lookup: HyperlinkMap | null): string {
  if (!text || !lookup || lookup.size === 0 || text.indexOf('『') === -1) return text;
  return text.replace(FILE_MENTION_RE, (full: string, name: string, offset: number) => {
    const before = text[offset - 1];
    const after = text.slice(offset + full.length, offset + full.length + 2);
    if (before === '[' && after === '](') return full;
    const url = lookup.get(normalizeFileKey(name));
    return url ? `[${full}](<${url}>)` : full;
  });
}

function useSourcesTick(messageId: string, enabled: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(BKL_SOURCES_EVENT, bump);
    return () => window.removeEventListener(BKL_SOURCES_EVENT, bump);
  }, [messageId, enabled]);
  return tick;
}

/**
 * 어시스턴트 답변 하나에 대한 파일명 → iManage URL 조회 맵. 아직 못 받았거나
 * 링크 걸 파일이 없으면 null.
 */
export function useBklAnswerHyperlinks(
  messageId: string,
  text: string,
  message: TMessage | undefined,
  enabled: boolean,
): HyperlinkMap | null {
  const hasMention = enabled && text.indexOf('『') !== -1;
  const sourcesTick = useSourcesTick(messageId, hasMention);
  const rid = useMemo(
    () => (hasMention ? resolveRid(messageId, text, message) : null),
    // text 가 바뀔 때마다 rid 를 다시 찾는다 — 스트리밍 끝에 rid 주석이 붙는다.
    // sourcesTick: 본문 주석이 없는 경로는 window.__bklRids 가 출처 캐시와
    // 함께 채워지므로 그 이벤트에도 다시 찾는다 (값 자체는 쓰지 않는다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasMention, messageId, text, message, sourcesTick],
  );
  const [ridMap, setRidMap] = useState<HyperlinkMap | null>(null);

  useEffect(() => {
    if (!rid) return;
    const cached = ridMapCache.get(rid);
    if (cached) {
      setRidMap(cached);
      return;
    }
    let cancelled = false;
    loadHyperlinkMap(rid).then((map) => {
      if (!cancelled && map) setRidMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [rid]);

  const sourcesMap = useMemo(() => {
    if (!hasMention) return null;
    const win = window as BklWindow;
    return hyperlinkMapFromSources(win.__bklSources?.[messageId]);
    // sourcesTick: window.__bklSources 변화 감지용 — 값 자체는 쓰지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMention, messageId, sourcesTick]);

  return useMemo(() => mergeMaps(ridMap, sourcesMap), [ridMap, sourcesMap]);
}
