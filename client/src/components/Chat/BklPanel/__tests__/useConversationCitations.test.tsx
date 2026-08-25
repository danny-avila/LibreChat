/**
 * 우측 대화 패널 집계 로직 테스트 (2026-08-25).
 *
 * 답변 완료 후 패널이 비어 보이는 회귀(사용자 보고)를 재현·방지한다:
 * 메시지 텍스트의 인용 파싱, API 미배포 시 window.__bklSources /
 * localStorage 폴백, 파일 유니크 집계까지 실제 훅을 렌더해 검증.
 */
import React from 'react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { parseCitedNumbers, useConversationCitations } from '../useConversationCitations';

jest.mock('~/data-provider/Sources', () => ({
  useConversationSources: jest.fn(() => ({
    data: undefined,
    isInitialLoading: false,
    refetch: jest.fn(),
  })),
}));

const CONVO_ID = 'conv-1';

function makeSource(fileName: string, docId?: string) {
  return {
    document: [`${fileName} 청크 본문`],
    metadata: [
      {
        name: `『${fileName}』- [n]`,
        source: 'chunk_n',
        ...(docId ? { doc_id: docId } : {}),
      },
    ],
  };
}

function msg(partial: Partial<TMessage>): TMessage {
  return {
    messageId: 'm-default',
    conversationId: CONVO_ID,
    isCreatedByUser: false,
    text: '',
    ...partial,
  } as TMessage;
}

function setup(messages: TMessage[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  client.setQueryData([QueryKeys.messages, CONVO_ID], messages);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return renderHook(() => useConversationCitations(CONVO_ID), { wrapper });
}

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).__bklSources;
  localStorage.clear();
});

describe('parseCitedNumbers', () => {
  it('낱개 [N] / 묶음 [1, 2] / [[N]](url) 링크를 모두 추출한다', () => {
    expect(parseCitedNumbers('시공을 담당하였습니다 [1]. 기재되어 있습니다 [3] .')).toEqual([1, 3]);
    expect(parseCitedNumbers('근거는 [1, 2, 7] 입니다')).toEqual([1, 2, 7]);
    expect(parseCitedNumbers('링크 [[4]](https://x/y) 형태')).toEqual([4]);
    expect(parseCitedNumbers('혼합 [[2]](u) 와 [5]')).toEqual([2, 5]);
  });

  it('연도 [2024] 같은 3자리 이상은 무시하고, 빈 텍스트는 빈 배열', () => {
    expect(parseCitedNumbers('판결 [2024] 참고')).toEqual([]);
    expect(parseCitedNumbers('')).toEqual([]);
  });

  it('rid 주석·파일명 괄호가 섞인 실제 답변 형태에서도 동작한다', () => {
    const real =
      '<!-- bkl_rid:abc123 -->\n**공사 개요**: 물류센터 신축공사입니다 『도로점용허가신청서 부분(자).hwp.md』- [1] . 계약은 『RE_.양수도.msg.md』- [3] 에 있습니다.';
    expect(parseCitedNumbers(real)).toEqual([1, 3]);
  });
});

describe('useConversationCitations — API 미배포 폴백', () => {
  const answer = msg({
    messageId: 'a1',
    text: '신축공사입니다 [1]. 계약 조건은 [2] 참고.',
  });
  const userMsg = msg({ messageId: 'u1', isCreatedByUser: true, text: '자료 있나?' });

  it('window.__bklSources 캐시만으로 turns/files 를 집계한다', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__bklSources = {
      a1: [makeSource('계약서.pdf', 'doc-1'), makeSource('계약서.pdf', 'doc-1')],
    };
    const { result } = setup([userMsg, answer]);
    expect(result.current.turns).toHaveLength(1);
    expect(result.current.turns[0].chunks.map((c) => c.n)).toEqual([1, 2]);
    expect(result.current.files).toHaveLength(1);
    expect(result.current.files[0].fileName).toBe('계약서.pdf');
    expect(result.current.files[0].count).toBe(2);
  });

  it('localStorage(bkl_src_*) 폴백으로도 집계한다', () => {
    localStorage.setItem(
      'bkl_src_a1',
      JSON.stringify({ s: [makeSource('제안서.docx'), makeSource('별지.pdf')], r: 'rid1' }),
    );
    const { result } = setup([userMsg, answer]);
    expect(result.current.turns[0].chunks.map((c) => c.fileName)).toEqual([
      '제안서.docx',
      '별지.pdf',
    ]);
    expect(result.current.files).toHaveLength(2);
  });

  it('출처가 어디에도 없으면 빈 결과 (isLoading 아님)', () => {
    const { result } = setup([userMsg, answer]);
    expect(result.current.turns).toHaveLength(0);
    expect(result.current.files).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
  });
});
