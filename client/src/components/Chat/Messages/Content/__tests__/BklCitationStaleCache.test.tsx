import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * DocRead virtual source 가 빠진 낡은 캐시에서 자가치유하는지 검사.
 *
 * 서버는 스트리밍 *전에* 검색 청크만으로 출처를 캐시한다. 그 시점에 프론트가
 * 조회하면 짧은 배열(예: 55개)을 받아 localStorage 까지 저장한다. 이후 서버가
 * 전문 읽기 결과 `[56]` 을 뒤에 덧붙여도 클라이언트는 낡은 배열을 그대로 써서
 * "출처 정보를 표시할 수 없습니다" 가 떴다 (2026-08-31 사용자 보고).
 *
 * 평소 조회 경로는 캐시가 있으면 그대로 돌려주므로 forceRefresh 없이는 절대
 * 낫지 않는다 — 그 점을 고정한다.
 */

const mockOpenSource = jest.fn();
let mockMessageId = 'm-default';

jest.mock('~/Providers', () => ({
  useMessageContext: () => ({ messageId: mockMessageId }),
}));

jest.mock('~/components/Chat/BklPanel/useActiveBklSource', () => ({
  useOpenBklSource: () => mockOpenSource,
}));

jest.mock('~/utils', () => ({
  FileTypeIcon: () => null,
}));

// 실제 구현대로 이벤트를 발행한다. 인용 칩은 이 이벤트로 캐시 갱신을 알아채므로
// jest.fn() 껍데기로 두면 폴링 안전망에만 기대게 돼 실제 경로를 못 재현한다.
jest.mock('~/utils/bklSourcesEvent', () => ({
  BKL_SOURCES_EVENT: 'bkl:sources-changed',
  notifyBklSourcesChanged: jest.fn(() => {
    // jest.mock 팩토리는 `window` 를 참조할 수 없다 — globalThis 로 우회.
    setTimeout(() => globalThis.dispatchEvent(new Event('bkl:sources-changed')), 0);
  }),
}));

import BklCitation from '../BklCitation';

/** `[n]` 자리를 채울 최소 출처. */
const source = (name: string) => ({
  source: { name },
  document: ['본문'],
  metadata: [{ name }],
});

/** 검색 청크 55개 — DocRead virtual source `[56]` 이 빠진 낡은 배열. */
const STALE = Array.from({ length: 55 }, (_, i) => source(`『검색${i + 1}.pdf』- [${i + 1}]`));
/** 서버가 뒤에 전문 읽기 결과를 덧붙인 완전한 배열. */
const FRESH = [...STALE, source('『재결서.pdf』- [56]')];

type BklWindow = {
  __bklSources: Record<string, unknown[]>;
  __bklRids: Record<string, string>;
  __bklSourcesByRid: Record<string, unknown[]>;
};

const win = () => window as unknown as BklWindow;

function seedStaleCache(messageId: string) {
  win().__bklSources = { [messageId]: STALE };
  win().__bklRids = { [messageId]: 'rid-1' };
  localStorage.setItem('bkl_src_' + messageId, JSON.stringify({ s: STALE, r: 'rid-1' }));
}

function mockServerReturns(sources: unknown[]) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ sources }),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  win().__bklSources = {};
  win().__bklRids = {};
  win().__bklSourcesByRid = {};
});

describe('낡은 캐시 자가치유', () => {
  it('캐시에 없는 뒤쪽 번호는 강제 재조회로 풀린다', async () => {
    mockMessageId = 'm-heal-label';
    seedStaleCache(mockMessageId);
    const fetchMock = mockServerReturns(FRESH);

    render(<BklCitation n={56} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // 재조회 결과가 캐시에 반영돼 라벨이 풀린다.
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('재결서'));
  });

  it('캐시에 있는 번호는 재조회하지 않는다', async () => {
    mockMessageId = 'm-cached';
    seedStaleCache(mockMessageId);
    const fetchMock = mockServerReturns(FRESH);

    render(<BklCitation n={3} />);

    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('검색3'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('없는 번호를 계속 두드리지 않는다 — 재조회는 한 번뿐', async () => {
    mockMessageId = 'm-bounded';
    seedStaleCache(mockMessageId);
    // 서버도 55개뿐인 경우 (예: 모델이 만들어낸 번호).
    const fetchMock = mockServerReturns(STALE);

    render(<BklCitation n={99} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // 폴링(400ms)이 여러 번 돌아도 재조회는 늘지 않아야 한다.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1300));
    });
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 900));
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('클릭 시에도 낡은 캐시를 강제로 갱신한 뒤 패널을 연다', async () => {
    mockMessageId = 'm-heal-click';
    seedStaleCache(mockMessageId);
    mockServerReturns(FRESH);

    render(<BklCitation n={56} />);
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('재결서'));

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(mockOpenSource).toHaveBeenCalledWith(mockMessageId, 56));
    // 갱신된 배열이 캐시에 남아 패널이 sources[55] 를 찾을 수 있다.
    expect(win().__bklSources[mockMessageId]).toHaveLength(56);
  });

  it('출처가 아예 없다고 서버가 답한 경우는 재조회하지 않는다', async () => {
    // 빈 배열은 "ACL 로 전부 걸러졌다" 는 확정 답이라 다시 물어봐야 소용없다.
    mockMessageId = 'm-empty';
    win().__bklSources = { [mockMessageId]: [] };
    const fetchMock = mockServerReturns(FRESH);

    render(<BklCitation n={1} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
