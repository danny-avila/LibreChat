import { cn } from '~/utils';

/**
 * "BKL Prism" 워드마크.
 *
 * 서비스 이름은 프리즘이 백색광을 스펙트럼으로 나눈다는 데서 왔고, 브랜드
 * 정의상 `BKL` 은 본문색, `Prism` 만 스펙트럼 그라디언트를 입는다. 사이드바 ·
 * 헤더 · 로그인이 각자 문자열을 들고 있으면 표기가 어긋나므로 여기 하나로 모은다.
 *
 * 스크린리더에는 그라디언트 조각이 아니라 "BKL Prism" 한 덩어리로 읽히게
 * 한다 — span 을 나눠두면 읽기 단위가 끊긴다.
 */
export default function PrismWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('whitespace-nowrap', className)} aria-label="BKL Prism">
      <span aria-hidden="true">BKL </span>
      <span aria-hidden="true" className="prism-spectrum-text">
        Prism
      </span>
    </span>
  );
}
