import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { RecoilRoot, useRecoilValue } from 'recoil';
import store from '~/store';
import type { ActiveBklSource } from '~/store/bklSources';
import {
  reconcileActiveSource,
  useOpenBklSource,
  useSyncActiveBklSourceWithConversation,
} from '../useActiveBklSource';

/**
 * 대화 A 에서 청크를 열어둔 채 '새 채팅' 으로 가면 A 의 청크가 그대로 남아
 * 있던 문제(2026-08-31 사용자 보고)의 회귀 테스트.
 */

const chunk = (conversationId: string | null): ActiveBklSource => ({
  conversationId,
  messageId: 'm1',
  n: 3,
});

describe('reconcileActiveSource', () => {
  it('같은 대화면 그대로 둔다', () => {
    const active = chunk('c1');
    expect(reconcileActiveSource(active, 'c1')).toBe(active);
  });

  it('다른 대화로 옮기면 지운다', () => {
    expect(reconcileActiveSource(chunk('c1'), 'c2')).toBeNull();
  });

  it("'새 채팅' 으로 나가면 지운다 — 사용자가 보고한 바로 그 경로", () => {
    expect(reconcileActiveSource(chunk('c1'), 'new')).toBeNull();
  });

  it('라우트에 대화 id 가 없어도 지운다', () => {
    expect(reconcileActiveSource(chunk('c1'), undefined)).toBeNull();
  });

  it("'new' 가 영구 id 로 승격되면 같은 대화이므로 유지하고 id 만 갈아끼운다", () => {
    // 첫 답변 스트리밍 중 인용을 누르면 'new' 로 저장된다. 답변이 끝나면
    // finalHandler 가 /c/{id} 로 navigate 하는데, 여기서 지우면 열어둔 패널이
    // 답변 완료와 동시에 닫혀버린다.
    expect(reconcileActiveSource(chunk('new'), 'c9')).toEqual(chunk('c9'));
  });

  it("'new' 에서 라우트 id 가 사라지면 지운다", () => {
    expect(reconcileActiveSource(chunk('new'), undefined)).toBeNull();
  });

  it('열린 청크가 없으면 계속 null 이다', () => {
    expect(reconcileActiveSource(null, 'c1')).toBeNull();
  });
});

/**
 * 실제 화면 전환을 재현하는 하니스.
 *
 * Presentation 이 대화 전환에 재마운트되지 않는다는 점이 중요해서, 라우트만
 * 갈아끼우고 Probe 는 계속 살아 있도록 `Routes` 밖에 둔다 — 재마운트로 상태가
 * 씻겨나가는 게 아니라 훅이 실제로 정리하는지 봐야 한다.
 */
function Harness({ initial }: { initial: string }) {
  return (
    <RecoilRoot>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/c/:conversationId" element={<Probe />} />
          <Route path="/" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </RecoilRoot>
  );
}

let openSource: (messageId: string, n: number) => void = () => undefined;
let go: (to: string) => void = () => undefined;

function Probe() {
  useSyncActiveBklSourceWithConversation();
  openSource = useOpenBklSource();
  go = useNavigate();
  const active = useRecoilValue(store.activeBklSource);
  return <div data-testid="active">{active ? JSON.stringify(active) : 'none'}</div>;
}

const activeText = () => screen.getByTestId('active').textContent;

describe('useOpenBklSource / useSyncActiveBklSourceWithConversation', () => {
  it('청크를 열면 현재 대화 id 가 함께 저장된다', () => {
    render(<Harness initial="/c/c1" />);
    act(() => openSource('m1', 3));
    expect(activeText()).toContain('"conversationId":"c1"');
  });

  it("대화 A 에서 청크를 열어둔 뒤 '새 채팅' 을 누르면 사라진다", () => {
    render(<Harness initial="/c/c1" />);
    act(() => openSource('m1', 3));
    expect(activeText()).toContain('"messageId":"m1"');

    act(() => go('/c/new'));

    expect(activeText()).toBe('none');
  });

  it('다른 대화로 옮기면 사라진다', () => {
    render(<Harness initial="/c/c1" />);
    act(() => openSource('m1', 3));

    act(() => go('/c/c2'));

    expect(activeText()).toBe('none');
  });

  it('같은 대화 안에서는 계속 열려 있다', () => {
    render(<Harness initial="/c/c1" />);
    act(() => openSource('m1', 3));

    act(() => go('/c/c1'));

    expect(activeText()).toContain('"messageId":"m1"');
  });

  it('새 채팅 첫 답변이 끝나 영구 id 를 받아도 열어둔 청크가 닫히지 않는다', () => {
    // finalHandler 가 /c/new → /c/{id} 로 navigate 하는 순간을 재현한다.
    render(<Harness initial="/c/new" />);
    act(() => openSource('m1', 3));

    act(() => go('/c/c9'));

    expect(activeText()).toContain('"messageId":"m1"');
    expect(activeText()).toContain('"conversationId":"c9"');
  });
});
