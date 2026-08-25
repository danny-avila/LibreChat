import { useMemo } from 'react';
import type { TMessage } from 'librechat-data-provider';
import { useGetMessagesByConvoId } from '~/data-provider';
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

/** messageId → 저장된 출처 배열. API 응답 우선, 스트리밍 중이면 SSE 캐시 폴백. */
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
  return fromApi ?? null;
}

export function useConversationCitations(conversationId: string | null | undefined) {
  const sourcesQuery = useConversationSources(conversationId);
  // ChatView 와 같은 쿼리 키(raw 캐시 공유) — select 없이 평면 목록을 그대로 쓴다.
  // 재생성으로 갈라진 형제 답변도 출처 행이 있으면 함께 쌓인다 (누적 뷰 의도).
  const { data: messages } = useGetMessagesByConvoId(conversationId ?? '', {
    enabled: Boolean(conversationId) && conversationId !== 'new',
  });

  return useMemo(() => {
    const apiByMessage = new Map<string, BklSource[]>();
    for (const row of sourcesQuery.data?.messages ?? []) {
      apiByMessage.set(row.message_id, row.sources ?? []);
    }

    const turns: CitedTurn[] = [];
    const fileMap = new Map<string, MentionedFile>();

    for (const msg of (messages ?? []) as TMessage[]) {
      if (msg.isCreatedByUser || !msg.messageId) continue;
      const text = msg.text ?? '';
      const citedNs = parseCitedNumbers(text);
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
      isLoading: sourcesQuery.isLoading,
    };
  }, [sourcesQuery.data, sourcesQuery.isLoading, messages]);
}
