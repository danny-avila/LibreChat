import { useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useRecoilState, useSetRecoilState } from 'recoil';
import store from '~/store';
import type { ActiveBklSource } from '~/store/bklSources';

/**
 * 우측 패널에 열린 청크(`activeBklSource`)를 현재 대화에 묶어두는 훅 모음.
 *
 * 아톰은 Recoil 전역이라 라우트가 바뀌어도 살아남는다. 그래서 대화 A 에서
 * 청크를 열어둔 채 '새 채팅' 으로 가면 A 의 청크 본문이 그대로 남아 있었다
 * (2026-08-31 사용자 보고). 열 때 대화 id 를 같이 저장하고, 라우트와 어긋나면
 * 지우는 방식으로 해결한다.
 *
 * 대화 id 를 아톰에 넣는 대신 "이전 라우트" 를 ref 로 들고 비교할 수도 있지만,
 * 그러면 컴포넌트가 다시 마운트될 때 이전 값을 잃어 낡은 청크가 살아남는다.
 * 아톰에 넣으면 판정이 상태 없이 성립한다.
 */

/** 새 대화가 아직 영구 id 를 못 받은 동안 라우트에 쓰이는 값. */
const PENDING_CONVERSATION_ID = 'new';

/**
 * 열린 청크를 유지할지 판정한다.
 *
 * - `null` 이면 지운다.
 * - 같은 대화면 그대로 둔다.
 * - `'new'` 에서 영구 id 로 승격된 것이면 같은 대화이므로 새 id 로 갈아끼운다.
 *   (첫 답변 스트리밍 중 인용을 클릭하면 `'new'` 로 저장되는데, 답변이 끝나면
 *   finalHandler 가 `/c/{id}` 로 navigate 한다 — 여기서 지우면 사용자가 열어둔
 *   패널이 답변 완료와 동시에 닫혀버린다.)
 * - 그 밖의 불일치는 다른 대화로 이동한 것이므로 지운다.
 *
 * 순수 함수로 분리해 라우터·Recoil 없이 테스트한다.
 */
export function reconcileActiveSource(
  active: ActiveBklSource | null,
  routeConversationId: string | null | undefined,
): ActiveBklSource | null {
  if (active == null) return null;
  const current = routeConversationId ?? null;
  if (active.conversationId === current) return active;
  if (active.conversationId === PENDING_CONVERSATION_ID && current != null) {
    return { ...active, conversationId: current };
  }
  return null;
}

/**
 * 라우트가 바뀌면 열린 청크를 정리한다. 항상 마운트돼 있는 컴포넌트
 * (Presentation) 에서 한 번만 호출한다 — 패널 자체는 조건부로 마운트되므로
 * 패널 안에서 호출하면 정리가 안 되는 경우가 생긴다.
 */
export function useSyncActiveBklSourceWithConversation(): void {
  const { conversationId } = useParams();
  const [active, setActive] = useRecoilState(store.activeBklSource);

  useEffect(() => {
    const next = reconcileActiveSource(active, conversationId);
    if (next !== active) {
      setActive(next);
    }
  }, [active, conversationId, setActive]);
}

/** 현재 대화 id 를 함께 묶어 청크를 여는 setter. */
export function useOpenBklSource(): (messageId: string, n: number) => void {
  const { conversationId } = useParams();
  const setActive = useSetRecoilState(store.activeBklSource);
  return useCallback(
    (messageId: string, n: number) =>
      setActive({ conversationId: conversationId ?? null, messageId, n }),
    [conversationId, setActive],
  );
}
