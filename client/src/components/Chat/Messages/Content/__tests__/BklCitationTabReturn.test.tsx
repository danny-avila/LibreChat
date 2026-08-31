import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';

/**
 * 답변을 기다리다 다른 탭에 갔다 돌아왔을 때 인용 칩이 스스로 낫는지 검사.
 *
 * 증상: 파일명이 안 박혀 있고 새로고침해야만 보인다 (2026-08-31 사용자 보고).
 *
 * 원인 두 가지가 겹쳤다.
 *
 * 1. `_fetchInflight` 에 messageId 를 넣기만 하고 절대 지우지 않았다.
 *    스트리밍 중 첫 조회는 메시지가 아직 저장 전이라 404 로 실패하는데,
 *    그 뒤로 그 메시지는 두 번 다시 조회되지 않았다.
 * 2. 배경 탭은 타이머가 크게 제한된다. 그 사이 스트림이 끝나며 발행된
 *    `bkl:sources-changed` 를 놓치면 다시 확인할 계기가 없었다.
 *
 * 새로고침이 고쳐주던 이유는 서버 재조회다 — 돌아온 시점에 같은 일을 한다.
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

// 실제 구현대로 이벤트를 발행한다 — 조회 성공이 칩에 전달되는 경로다.
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

const FULL = [source('『검색1.pdf』- [1]'), source('『재결서.pdf』- [2]')];

type BklWindow = {
  __bklSources: Record<string, unknown[]>;
  __bklRids: Record<string, string>;
  __bklSourcesByRid: Record<string, unknown[]>;
};

const win = () => window as unknown as BklWindow;

/**
 * 스트리밍 중에는 아직 출처가 없다가, 답변이 끝나면 서버가 내주기 시작한다.
 *
 * 실패 응답으로 503 을 쓴다. `fetchWithRetry` 는 404 만 500ms 뒤에 재시도하는데,
 * 그 재시도 창이 열려 있는 동안 서버를 준비시키면 **탭 복귀와 무관하게** 낫는다.
 * 그러면 수정을 되돌려도 테스트가 통과해 아무것도 지켜주지 못한다(실제로 그랬다).
 * 재시도가 없는 코드를 쓰면 "마운트 조회는 확실히 실패로 끝났다" 가 결정적으로
 * 성립한다.
 */
function serverNotReadyThenReady(readySources: unknown[]) {
  let ready = false;
  const fetchMock = jest.fn().mockImplementation(async () => {
    if (!ready) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ sources: readySources }) };
  });
  global.fetch = fetchMock as unknown as typeof fetch;

  const waitForMountFetchToFail = async () => {
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  return { fetchMock, waitForMountFetchToFail, finishStreaming: () => (ready = true) };
}

function switchAway() {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden',
  });
}

function comeBack() {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  win().__bklSources = {};
  win().__bklRids = {};
  win().__bklSourcesByRid = {};
  comeBack();
});

describe('탭에 돌아왔을 때', () => {
  it('스트리밍 중 조회가 실패했어도 돌아오면 다시 받아 파일명을 채운다', async () => {
    mockMessageId = 'm-tab-return';
    const { waitForMountFetchToFail, finishStreaming } = serverNotReadyThenReady(FULL);

    render(<BklCitation n={2} />);
    // 마운트 조회가 재시도까지 모두 404 로 끝난 뒤 — 아직 맨숫자.
    await waitForMountFetchToFail();
    expect(screen.getByRole('button')).toHaveTextContent('2');
    expect(screen.getByRole('button')).not.toHaveTextContent('재결서');

    // 다른 탭에 가 있는 동안 답변이 끝나 서버에 출처가 저장된다.
    switchAway();
    finishStreaming();

    comeBack();

    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('재결서.pdf'), {
      timeout: 3000,
    });
  });

  it('돌아왔을 때 이미 캐시에 있으면 서버를 다시 부르지 않는다', async () => {
    mockMessageId = 'm-tab-cached';
    const { fetchMock } = serverNotReadyThenReady(FULL);
    win().__bklSources[mockMessageId] = FULL;

    render(<BklCitation n={2} />);
    expect(screen.getByRole('button')).toHaveTextContent('재결서.pdf');

    switchAway();
    comeBack();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('출처가 끝내 안 오면 무한히 두드리지 않는다', async () => {
    mockMessageId = 'm-tab-never';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<BklCitation n={2} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    for (let i = 0; i < 20; i++) {
      switchAway();
      comeBack();
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await Promise.resolve();
      });
    }

    // messageId 당 조회 6회 상한. 503 은 재시도가 없으므로 조회 1회당 호출 1회.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it('탭을 떠나 있는 동안에는 재조회하지 않는다', async () => {
    mockMessageId = 'm-tab-hidden';
    const { fetchMock, waitForMountFetchToFail } = serverNotReadyThenReady(FULL);

    render(<BklCitation n={2} />);
    await waitForMountFetchToFail();
    const afterMount = fetchMock.mock.calls.length;

    switchAway();
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(fetchMock.mock.calls.length).toBe(afterMount);
  });

  it('언마운트하면 visibilitychange 리스너를 남기지 않는다', async () => {
    mockMessageId = 'm-tab-unmount';
    serverNotReadyThenReady(FULL);
    const added = jest.spyOn(document, 'addEventListener');
    const removed = jest.spyOn(document, 'removeEventListener');

    const view = render(<BklCitation n={2} />);
    await act(async () => {
      await Promise.resolve();
    });
    view.unmount();

    const registered = added.mock.calls.filter(([type]) => type === 'visibilitychange');
    const unregistered = removed.mock.calls.filter(([type]) => type === 'visibilitychange');
    expect(registered).toHaveLength(1);
    expect(unregistered[0][1]).toBe(registered[0][1]);

    added.mockRestore();
    removed.mockRestore();
  });
});
