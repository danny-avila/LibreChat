import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type { KeywordSearchRequest, KeywordSearchResponse } from './types';

const BKL_PROXY_BASE = '/bkl';

async function postKeywordSearch(
  body: KeywordSearchRequest,
): Promise<KeywordSearchResponse> {
  const res = await fetch(`${BKL_PROXY_BASE}/api/search/keyword`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const err = await res.json();
      detail = typeof err?.detail === 'string' ? err.detail : JSON.stringify(err);
    } catch {
      detail = await res.text();
    }
    throw new Error(`keyword search failed (${res.status}): ${detail}`);
  }

  return (await res.json()) as KeywordSearchResponse;
}

export function useDocumentKeywordSearch(): UseMutationResult<
  KeywordSearchResponse,
  Error,
  KeywordSearchRequest
> {
  return useMutation({
    mutationFn: postKeywordSearch,
  });
}
