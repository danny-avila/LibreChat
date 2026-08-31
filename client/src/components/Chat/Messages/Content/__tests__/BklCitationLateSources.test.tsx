import React from 'react';
import { render, screen, act } from '@testing-library/react';

/**
 * 출처가 늦게 도착해도 인용 칩이 스스로 파일명을 채우는지 검사.
 *
 * 예전에는 마운트 후 20초 동안만 400ms 폴링을 돌렸다. 그런데 스트리밍 중
 * 출처는 `_pending_*` 키에 있어 messageId 로는 안 보이고, 실제 배열은 스트림이
 * 끝나야 옮겨진다. 전문 읽기가 붙은 답변은 60초를 넘기므로 그 전에 폴링 창이
 * 닫혀, 인용이 파일명·아이콘 없이 맨숫자로 남고 눌러야만 이름이 떴다
 * (2026-08-31 사용자 보고).
 *
 * 캐시에 쓰는 모든 지점이 `bkl:sources-changed` 를 발행하므로, 폴링 대신
 * 이를 구독하면 시간 제한이 사라진다. 폴링 창(120초)을 넘긴 시점에 도착시켜
 * "이벤트가 풀었다" 는 것을 못 박는다.
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
  FileTypeIcon: ({ ext }: { ext?: string | null }) => (
    <i data-testid="file-icon" data-ext={ext ?? ''} />
  ),
}));

jest.mock('~/utils/bklSourcesEvent', () => ({
  BKL_SOURCES_EVENT: 'bkl:sources-changed',
  notifyBklSourcesChanged: jest.fn(),
}));

import BklCitation from '../BklCitation';

const BKL_SOURCES_EVENT = 'bkl:sources-changed';
/** 폴링 안전망(120초)보다 확실히 뒤 — 이 시점 해결은 이벤트만 설명할 수 있다. */
const PAST_POLL_WINDOW_MS = 130_000;

const source = (name: string) => ({
  source: { name },
  document: ['본문'],
  metadata: [{ name }],
});

/** 검색 청크 55개 + 전문 읽기 조각 `[56]`. */
const FULL = [
  ...Array.from({ length: 55 }, (_, i) => source(`『검색${i + 1}.pdf』- [${i + 1}]`)),
  source('『재결서.pdf』- [56]'),
];

type BklWindow = {
  __bklSources: Record<string, unknown[]>;
  __bklRids: Record<string, string>;
  __bklSourcesByRid: Record<string, unknown[]>;
};

const win = () => window as unknown as BklWindow;

/** 서버에도 아직 출처가 없는 상태 — 스트리밍이 끝나기 전. */
function mockServerHasNothing() {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ sources: [] }),
  }) as unknown as typeof fetch;
}

/** 마운트 이펙트의 비동기 조회를 흘려보낸다. */
async function flushMountFetch() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** 스트림이 끝나 완전한 배열이 messageId 로 옮겨진 순간. */
function sourcesArrive(messageId: string) {
  win().__bklSources[messageId] = FULL;
  act(() => {
    window.dispatchEvent(new Event(BKL_SOURCES_EVENT));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  localStorage.clear();
  win().__bklSources = {};
  win().__bklRids = {};
  win().__bklSourcesByRid = {};
});

afterEach(() => {
  jest.useRealTimers();
});

describe('늦게 도착하는 출처', () => {
  it('폴링 창이 닫힌 뒤에 도착해도 클릭 없이 파일명이 뜬다', async () => {
    mockMessageId = 'm-late-label';
    mockServerHasNothing();

    render(<BklCitation n={56} />);
    await flushMountFetch();

    // 아직은 맨숫자.
    expect(screen.getByRole('button')).toHaveTextContent('56');
    expect(screen.getByRole('button')).not.toHaveTextContent('재결서');

    act(() => {
      jest.advanceTimersByTime(PAST_POLL_WINDOW_MS);
    });
    sourcesArrive(mockMessageId);

    expect(screen.getByRole('button')).toHaveTextContent('재결서.pdf');
  });

  it('파일명과 함께 확장자 아이콘도 같이 풀린다', async () => {
    mockMessageId = 'm-late-icon';
    mockServerHasNothing();

    render(<BklCitation n={56} />);
    await flushMountFetch();

    expect(screen.queryByTestId('file-icon')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(PAST_POLL_WINDOW_MS);
    });
    sourcesArrive(mockMessageId);

    expect(screen.getByTestId('file-icon')).toHaveAttribute('data-ext', 'pdf');
  });

  it('이미 캐시된 출처는 이벤트를 기다리지 않고 바로 표시한다', async () => {
    mockMessageId = 'm-already';
    win().__bklSources[mockMessageId] = FULL;
    mockServerHasNothing();

    render(<BklCitation n={56} />);

    expect(screen.getByRole('button')).toHaveTextContent('재결서.pdf');
  });

  it('언마운트하면 리스너를 남기지 않는다', async () => {
    mockMessageId = 'm-unmount';
    mockServerHasNothing();
    const added = jest.spyOn(window, 'addEventListener');
    const removed = jest.spyOn(window, 'removeEventListener');

    const view = render(<BklCitation n={56} />);
    await flushMountFetch();
    view.unmount();

    const registered = added.mock.calls.filter(([type]) => type === BKL_SOURCES_EVENT);
    const unregistered = removed.mock.calls.filter(([type]) => type === BKL_SOURCES_EVENT);
    expect(registered).toHaveLength(1);
    expect(unregistered).toHaveLength(1);
    expect(unregistered[0][1]).toBe(registered[0][1]);

    added.mockRestore();
    removed.mockRestore();
  });
});
