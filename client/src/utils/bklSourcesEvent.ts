/**
 * window.__bklSources 는 SSE 핸들러·인용 컴포넌트가 직접 채우는 비반응형
 * 전역 캐시다. 우측 대화 패널(useConversationCitations)이 1초 폴링에만
 * 의존하면 출처 도착 후 패널 갱신까지 눈에 띄는 지연이 생기므로, 캐시에
 * 쓰는 모든 지점이 이 이벤트를 발행하고 패널은 이를 구독해 즉시 재집계한다.
 *
 * dispatch 는 setTimeout(0) 으로 한 틱 미룬다 — 렌더 도중 호출되는 경로가
 * 있어도 "setState during render" 경고 없이 안전하다.
 */
export const BKL_SOURCES_EVENT = 'bkl:sources-changed';

export function notifyBklSourcesChanged(): void {
  if (typeof window === 'undefined') return;
  window.setTimeout(() => {
    window.dispatchEvent(new Event(BKL_SOURCES_EVENT));
  }, 0);
}
