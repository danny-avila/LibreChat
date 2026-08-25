import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ConversationSourcesResponse } from './types';

const BKL_PROXY_BASE = '/bkl';

export const conversationSourcesQueryKey = (conversationId: string) => [
  'bklConvoSources',
  conversationId,
];

/**
 * 대화 전체의 답변별 출처(bkl_chat_sources) — 우측 대화 패널의 누적 뷰용.
 *
 * plain fetch 가 아니라 전역 axios 를 쓴다 — setTokenHeader() 가 심어둔
 * Authorization 헤더가 실려야 /bkl 프록시가 X-BKL-User-Sid 를 주입하고,
 * 비공개 사건 출처가 ACL 을 통과한다 (projects 쿼리와 동일한 이유).
 */
export function useConversationSources(
  conversationId: string | null | undefined,
): UseQueryResult<ConversationSourcesResponse, Error> {
  return useQuery<ConversationSourcesResponse, Error>({
    queryKey: conversationSourcesQueryKey(conversationId ?? ''),
    queryFn: async () => {
      const res = await axios.get<ConversationSourcesResponse>(
        `${BKL_PROXY_BASE}/v1/sources/by-conversation/${encodeURIComponent(conversationId!)}`,
      );
      return res.data;
    },
    enabled: Boolean(conversationId) && conversationId !== 'new',
    staleTime: 15_000,
    retry: 1,
  });
}
