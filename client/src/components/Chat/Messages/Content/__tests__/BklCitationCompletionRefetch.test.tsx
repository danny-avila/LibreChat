import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';

/**
 * 답변 완료 시점에 출처를 다시 받아, 전문 읽기 인용이 클릭 없이 풀리는지 검사.
 *
 * 증상: 검색 인용 `[1..55]` 는 바로 파일명이 박히는데 전문 읽기로 붙은
 * `[56]` 은 **눌러야만** 몇 초 뒤에 들어온다 (2026-08-31 사용자 보고).
 *
 * 원인: 스트리밍 중 조회하면 서버가 아직 검색 청크만 캐시해둔 상태라 짧은
 * 배열이 온다. 그 배열이 클라이언트 캐시에 앉으면 앞 번호는 풀리지만 뒤
 * 번호는 자리가 비어 있다. 그런데 폴링도 이벤트도 캐시를 **다시 읽기**만 할 뿐
 * **다시 요청**하지는 않아서, 눌러서 강제 조회가 돌기 전까지 안 풀렸다.
 *
 * 답변 완료가 "서버에 완전한 배열이 올라왔다" 는 유일하게 확실한 신호다.
 */

const mockOpenSource = jest.fn();
const mockContext: { messageId: string; isSubmitting?: boolean } = {
  messageId: 'm-default',
  isSubmitting: false,
};

jest.mock('~/Providers', () => ({
  useMessageContext: () => mockContext,
}));

jest.mock('~/components/Chat/BklPanel/useActiveBklSource', () => ({
  useOpenBklSource: () => mockOpenSource,
}));

jest.mock('~/utils', () => ({
  FileTypeIcon: () => null,
}));

jest.mock('~/utils/bklSourcesEvent', () => ({
  BKL_SOURCES_EVENT: 'bkl:sources-changed',
  notifyBklSourcesChanged: jest.fn(() => {
    setTimeout(() => globalThis.dispatchEvent(new Event('bkl:sources-changed')), 0);
  }),
}));

import BklCitation from '../BklCitation';

const source = (name: string) => ({
  source: { name },
  document: ['본문'],
  metadata: [{ name }],
});

/** 스트리밍 중 서버가 내주는 배열 — 검색 청크뿐, 전문 읽기 결과는 아직 없다. */
const SEARCH_ONLY = Array.from({ length: 55 }, (_, i) =>
  source(`『검색${i + 1}.pdf』- [${i + 1}]`),
);
/** 답변이 끝난 뒤 서버가 내주는 완전한 배열. */
const WITH_DOC_READ = [...SEARCH_ONLY, source('『재결서.pdf』- [56]')];

const DOC_READ_N = 56;

type BklWindow = {
  __bklSources: Record<string, unknown[]>;
  __bklRids: Record<string, string>;
  __bklSourcesByRid: Record<string, unknown[]>;
};

const win = () => window as unknown as BklWindow;

/** 스트리밍 중 프리페치로 짧은 배열이 이미 캐시에 앉은 상태. */
function seedSearchOnlyCache(messageId: string) {
  win().__bklSources[messageId] = SEARCH_ONLY;
  win().__bklRids[messageId] = 'rid-1';
}

function serverReturns(sources: unknown[]) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ sources }),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/**
 * 실제 순서를 재현한다: 캐시는 비어 있고, 스트리밍 중 조회하면 서버가 검색
 * 청크만 담긴 짧은 배열을 준다. 답변이 끝나야 전문 읽기 결과가 붙는다.
 *
 * 짧은 배열을 미리 캐시에 심어두면 안 된다 — 그러면 마운트 시점의 낡은 캐시
 * 자가치유(`refreshStaleCache`)가 대신 고쳐버려서, 수정을 되돌려도 테스트가
 * 통과한다(실제로 그랬다). 갇히는 경로는 "빈 캐시 → 짧은 배열 도착" 이다.
 */
function serverCompletesOnFinish(messageId: string) {
  win().__bklRids[messageId] = 'rid-1';
  let finished = false;
  const fetchMock = jest.fn().mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ sources: finished ? WITH_DOC_READ : SEARCH_ONLY }),
  }));
  global.fetch = fetchMock as unknown as typeof fetch;

  const waitForSearchOnlyCache = () =>
    waitFor(() => expect(win().__bklSources[messageId]).toHaveLength(SEARCH_ONLY.length));

  return { fetchMock, waitForSearchOnlyCache, serverGetsDocRead: () => (finished = true) };
}

/** 답변이 끝났다 — isSubmitting 이 true 에서 false 로 떨어진다. */
function finishAnswer(rerender: (ui: React.ReactElement) => void, n: number) {
  mockContext.isSubmitting = false;
  act(() => {
    rerender(<BklCitation n={n} />);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  win().__bklSources = {};
  win().__bklRids = {};
  win().__bklSourcesByRid = {};
  mockContext.isSubmitting = false;
});

describe('답변 완료 시 출처 재조회', () => {
  it('스트리밍 중 받은 짧은 배열에 갇히지 않고 완료 후 클릭 없이 풀린다', async () => {
    mockContext.messageId = 'm-complete-heal';
    mockContext.isSubmitting = true;
    const { waitForSearchOnlyCache, serverGetsDocRead } = serverCompletesOnFinish(
      mockContext.messageId,
    );

    const { rerender } = render(<BklCitation n={DOC_READ_N} />);

    // 스트리밍 중 조회가 짧은 배열을 캐시했다 — 이 번호 자리는 비어 있다.
    await waitForSearchOnlyCache();
    expect(screen.getByRole('button')).toHaveTextContent(String(DOC_READ_N));
    expect(screen.getByRole('button')).not.toHaveTextContent('재결서');

    serverGetsDocRead();
    finishAnswer(rerender, DOC_READ_N);

    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('재결서.pdf'));
    expect(mockOpenSource).not.toHaveBeenCalled();
  });

  it('같은 배열에 들어 있는 검색 인용은 완료를 기다리지 않는다', async () => {
    mockContext.messageId = 'm-complete-search';
    mockContext.isSubmitting = true;
    seedSearchOnlyCache(mockContext.messageId);
    const fetchMock = serverReturns(WITH_DOC_READ);

    render(<BklCitation n={1} />);

    expect(screen.getByRole('button')).toHaveTextContent('검색1.pdf');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('완료 시점에 이미 풀려 있으면 서버를 부르지 않는다', async () => {
    mockContext.messageId = 'm-complete-noop';
    mockContext.isSubmitting = true;
    win().__bklSources[mockContext.messageId] = WITH_DOC_READ;
    const fetchMock = serverReturns(WITH_DOC_READ);

    const { rerender } = render(<BklCitation n={DOC_READ_N} />);
    expect(screen.getByRole('button')).toHaveTextContent('재결서.pdf');

    finishAnswer(rerender, DOC_READ_N);
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('완료 전환이 없는 지난 대화에서는 추가 조회를 하지 않는다', async () => {
    mockContext.messageId = 'm-complete-old';
    mockContext.isSubmitting = false;
    win().__bklSources[mockContext.messageId] = WITH_DOC_READ;
    const fetchMock = serverReturns(WITH_DOC_READ);

    const { rerender } = render(<BklCitation n={DOC_READ_N} />);
    act(() => {
      rerender(<BklCitation n={DOC_READ_N} />);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('완료 직후 서버가 아직 준비 안 됐어도 뒤이은 시도로 낫는다', async () => {
    mockContext.messageId = 'm-complete-lag';
    mockContext.isSubmitting = true;
    win().__bklRids[mockContext.messageId] = 'rid-1';

    // 완료 직후 두 번째 조회까지는 아직 짧은 배열, 그 뒤부터 완전한 배열.
    let served = 0;
    global.fetch = jest.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ sources: served++ < 2 ? SEARCH_ONLY : WITH_DOC_READ }),
    })) as unknown as typeof fetch;

    const { rerender } = render(<BklCitation n={DOC_READ_N} />);
    await waitFor(() =>
      expect(win().__bklSources[mockContext.messageId]).toHaveLength(SEARCH_ONLY.length),
    );
    finishAnswer(rerender, DOC_READ_N);

    await waitFor(
      () => expect(screen.getByRole('button')).toHaveTextContent('재결서.pdf'),
      { timeout: 8000 },
    );
  }, 15000);
});
