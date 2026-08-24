import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useRecoilState } from 'recoil';
import { Info, X } from 'lucide-react';
import store from '~/store';
import { cn } from '~/utils';

/**
 * BKL: 상단 안내 banner — bkl DB AI 의 초기 테스트 상태와 검색 범위 한정 명시.
 *
 *   디자인:
 *     - 단색 amber tint (그라데이션 없음 — 사용자 피드백). 좌측 Info 아이콘 + 본문 + 우측 X.
 *     - 줄바꿈 자연스럽게: title + body 를 분리 + leading-relaxed.
 *     - 닫기 X — flex 안에 형제 element 로 두어 안전하게 클릭 가능 (absolute 회피).
 *     - 로컬 스토리지에 닫힘을 저장하지 않음. 새 채팅(NEW) 진입 시마다 다시 표시됨.
 */
export default function BklTopBanner() {
  const [dismissed, setDismissed] = useRecoilState(store.topBannerDismissed);
  const { conversationId } = useParams();

  // 새로운 채팅(URL에 conversationId 파라미터가 없거나 'new'일 경우) 진입 시 배너 표시 상태 초기화
  useEffect(() => {
    if (!conversationId || conversationId === 'new') {
      setDismissed(false);
    }
  }, [conversationId, setDismissed]);

  if (dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'w-full border-b border-amber-300/50',
        'bg-amber-50 text-amber-900',
        // BKL: 다크모드에서 /10 같은 투명도를 쓰면 뒤가 비쳐서 그라데이션처럼 
        // 보인다는 피드백 반영. 완전히 불투명한(solid) 단색 배경색으로 강제 고정.
        'dark:border-amber-900 dark:bg-[#3d2e15] dark:text-amber-100',
      )}
    >
      <div className="mx-auto flex max-w-5xl items-start gap-3 px-4 py-2.5">
        <Info
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 text-xs leading-relaxed sm:text-sm">
          <p className="font-semibold">bkl DB AI 베타 서비스 안내</p>
          <div className="mt-0.5 text-amber-800 dark:text-amber-200">
            <p>
              현재 본 서비스는 베타 서비스 단계이며,{' '}
              <span className="font-bold underline">2023.06.30 ~ 2026.06.30 3개년 종결 사건</span>
              에 한해 검색이 제공됩니다.
            </p>
            <p className="mt-0.5 sm:mt-0">
              그 외 자료는 검색 결과에서 누락될 수 있으며, 검색가능 기간이 추가되면 본 공지를 통해 안내드릴 예정입니다.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDismissed(true);
          }}
          aria-label="베타 서비스 안내 닫기"
          title="닫기"
          className={cn(
            'relative z-10 -mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md self-center',
            'text-amber-700 hover:bg-amber-500/20 hover:text-amber-900',
            'dark:text-amber-300 dark:hover:bg-amber-500/20 dark:hover:text-amber-100',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50',
          )}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
