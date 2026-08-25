import { useEffect, useMemo, useRef, useState } from 'react';
import type { TMessage } from 'librechat-data-provider';
// 배럴(~/data-provider)이 아니라 서브패스 — jsPDF 등 무거운 의존을 안 끌어온다.
import { useGetMessagesByConvoId } from '~/data-provider/Messages';
import { useConversationSources } from '~/data-provider/Sources';
import type { BklSource } from '~/components/Chat/Messages/Content/ChunkModal';

/**
 * 대화 누적 인용 집계 — 우측 대화 패널의 데이터 소스.
 *
 * bkl_chat_sources 에는 답변당 번호 붙은 출처 전체가 저장되지만, 그중
 * 본문에 [N] 으로 실제 인용된 것만 패널에 쌓는다. 인용 판정은 클라이언트에서
 * assistant 메시지 텍스트를 파싱해 수행한다 (스트리밍 변환 후 저장 포맷인
 * `[[N]](url)` 링크 + 낱개 `[N]` + 묶음 `[1, 2, 3]` 모두 수용).
 */

// [[N]](url) — 스트리밍 인용 변환기가 저장하는 링크 포맷.
const CITE_LINK_RE = /\[\[(\d{1,2})\]\]\([^)]*\)/g;
// [N] / [1, 2, 3] — 변환 전 원문·딥씽킹 경로 포맷 (쉼표 묶음 허용).
const CITE_PLAIN_RE = /\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g;

/** 답변 텍스트에서 실제 인용된 번호 집합을 추출 (숫자 오름차순, 중복 제거). */
export function parseCitedNumbers(text: string): number[] {
  if (!text) return [];
  const ns = new Set<number>();
  let stripped = '';
  let last = 0;
  for (const m of text.matchAll(CITE_LINK_RE)) {
    ns.add(Number(m[1]));
    stripped += text.slice(last, m.index);
    last = (m.index ?? 0) + m[0].length;
  }
  stripped += text.slice(last);
  for (const m of stripped.matchAll(CITE_PLAIN_RE)) {
    for (const part of m[1].split(',')) {
      const n = Number(part.trim());
      if (n >= 1) ns.add(n);
    }
  }
  return [...ns].sort((a, b) => a - b);
}

/**
 * 답변 텍스트 추출 — msg.text 우선, 비어 있으면 content parts 를 이어붙인다.
 *
 * Resumable Stream 경로에서는 답변이 `content: [{type:'text', text:{value}}]`
 * 로 저장되고 `text` 는 빈 문자열이다 (2026-08-25 사용자 진단: 이 때문에
 * 인용 파싱이 0건이 되어 패널이 "인용 없음" 으로 비어 보였다).
 */
export function messageText(msg: TMessage): string {
  const direct = msg.text ?? '';
  if (direct) return direct;
  const parts = (msg as { content?: unknown }).content;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((p) => {
      if (!p || typeof p !== 'object') return '';
      const part = p as { type?: string; text?: string | { value?: string } };
      if (part.type && part.type !== 'text') return '';
      return typeof part.text === 'string' ? part.text : (part.text?.value ?? '');
    })
    .join('');
}

export function extractFileName(source: BklSource): string {
  const meta = source.metadata?.[0];
  const raw = String(meta?.name ?? meta?.file_name ?? '출처 문서').normalize('NFC');
  const m = raw.match(/^『(.+?)』/);
  return m ? m[1] : raw;
}

function sourceImanageUrl(source: BklSource): string | null {
  const meta = source.metadata?.[0] as Record<string, unknown> | undefined;
  return (
    source.source?.imanage_url ??
    source.source?.imanage_preview_url ??
    (typeof meta?.imanage_url === 'string' ? (meta.imanage_url as string) : null) ??
    (typeof meta?.imanage_preview_url === 'string' ? (meta.imanage_preview_url as string) : null)
  );
}

function sourceDocId(source: BklSource): string | null {
  const meta = source.metadata?.[0] as Record<string, unknown> | undefined;
  return typeof meta?.doc_id === 'string' && meta.doc_id ? (meta.doc_id as string) : null;
}

export type CitedChunk = {
  messageId: string;
  n: number;
  source: BklSource;
  fileName: string;
};

export type CitedTurn = {
  messageId: string;
  /** 1-based 답변 순번 (인용이 있는 답변만 센다). */
  index: number;
  chunks: CitedChunk[];
};

export type MentionedFile = {
  /** doc_id 우선, 없으면 파일명 — 유니크 집계 키. */
  key: string;
  fileName: string;
  /** 이 파일에서 인용된 청크 수. */
  count: number;
  imanageUrl: string | null;
  /** 아이콘·타입 판별용 대표 소스. */
  sample: BklSource;
};

/**
 * messageId → 저장된 출처 배열. API 응답 우선, 없으면 스트리밍 캐시
 * (window.__bklSources) → localStorage(bkl_src_*, BklCitation 이 쓰는 것과
 * 동일 키) 순으로 폴백한다. API 미배포·재접속 직후에도 패널이 차도록.
 */
function sourcesForMessage(
  apiByMessage: Map<string, BklSource[]>,
  messageId: string,
): BklSource[] | null {
  const fromApi = apiByMessage.get(messageId);
  if (fromApi && fromApi.length > 0) return fromApi;
  const mem = (window as unknown as { __bklSources?: Record<string, unknown> }).__bklSources?.[
    messageId
  ];
  if (Array.isArray(mem) && mem.length > 0) return mem as BklSource[];
  try {
    const raw = localStorage.getItem('bkl_src_' + messageId);
    if (raw) {
      const parsed = JSON.parse(raw) as { s?: unknown };
      if (Array.isArray(parsed?.s) && parsed.s.length > 0) return parsed.s as BklSource[];
    }
  } catch {
    /* parse error — ignore */
  }
  return fromApi ?? null;
}

/**
 * window.__bklSources 는 SSE 가 직접 채우는 비반응형 캐시라, 스트리밍이 끝나
 * 출처가 도착해도 React 는 모른다. 값싼 시그니처(메시지 키 + 각 배열 길이)를
 * 주기적으로 비교해 변할 때만 tick 을 올려 집계를 다시 돌린다.
 */
function useStreamingSourcesTick(): number {
  const [tick, setTick] = useState(0);
  const sigRef = useRef('');
  useEffect(() => {
    const iv = setInterval(() => {
      const cache = (window as unknown as { __bklSources?: Record<string, unknown[]> })
        .__bklSources;
      const sig = cache
        ? Object.keys(cache)
            .sort()
            .map((k) => `${k}:${Array.isArray(cache[k]) ? cache[k].length : 0}`)
            .join('|')
        : '';
      if (sig !== sigRef.current) {
        sigRef.current = sig;
        setTick((t) => t + 1);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, []);
  return tick;
}

export function useConversationCitations(conversationId: string | null | undefined) {
  const sourcesQuery = useConversationSources(conversationId);
  // ChatView 와 같은 쿼리 키(raw 캐시 공유) — select 없이 평면 목록을 그대로 쓴다.
  // 재생성으로 갈라진 형제 답변도 출처 행이 있으면 함께 쌓인다 (누적 뷰 의도).
  const { data: messages } = useGetMessagesByConvoId(conversationId ?? '', {
    enabled: Boolean(conversationId) && conversationId !== 'new',
  });
  const streamTick = useStreamingSourcesTick();

  // 새 답변이 저장되면 대화 단위 출처도 다시 가져온다 (스트리밍 캐시 폴백이
  // 먼저 채우고, PG 영속본이 도착하면 그걸로 대체되는 순서).
  const assistantCount = (messages ?? []).filter((m) => !m.isCreatedByUser).length;
  const refetchSources = sourcesQuery.refetch;
  useEffect(() => {
    if (assistantCount > 0) {
      refetchSources();
    }
  }, [assistantCount, refetchSources]);

  return useMemo(() => {
    const apiByMessage = new Map<string, BklSource[]>();
    for (const row of sourcesQuery.data?.messages ?? []) {
      apiByMessage.set(row.message_id, row.sources ?? []);
    }

    const turns: CitedTurn[] = [];
    const fileMap = new Map<string, MentionedFile>();

    for (const msg of (messages ?? []) as TMessage[]) {
      if (msg.isCreatedByUser || !msg.messageId) continue;
      const citedNs = parseCitedNumbers(messageText(msg));
      if (citedNs.length === 0) continue;
      const sources = sourcesForMessage(apiByMessage, msg.messageId);
      if (!sources || sources.length === 0) continue;

      const chunks: CitedChunk[] = [];
      for (const n of citedNs) {
        const source = sources[n - 1];
        if (!source) continue;
        const fileName = extractFileName(source);
        chunks.push({ messageId: msg.messageId, n, source, fileName });

        const key = sourceDocId(source) ?? fileName;
        const existing = fileMap.get(key);
        if (existing) {
          existing.count += 1;
          if (!existing.imanageUrl) existing.imanageUrl = sourceImanageUrl(source);
        } else {
          fileMap.set(key, {
            key,
            fileName,
            count: 1,
            imanageUrl: sourceImanageUrl(source),
            sample: source,
          });
        }
      }
      if (chunks.length > 0) {
        turns.push({ messageId: msg.messageId, index: turns.length + 1, chunks });
      }
    }

    return {
      turns,
      files: [...fileMap.values()],
      // v4 에서 disabled 쿼리는 status 'loading' 이므로 isInitialLoading 을
      // 써야 새 대화(landing)에서 "불러오는 중" 이 영영 뜨지 않는다.
      isLoading: sourcesQuery.isInitialLoading,
    };
    // streamTick: window.__bklSources 변화 감지용 — 값 자체는 쓰지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesQuery.data, sourcesQuery.isInitialLoading, messages, streamTick]);
}
