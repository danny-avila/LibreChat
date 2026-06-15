import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  AtSign,
  Filter,
  Sparkles,
  FileSearch,
  Quote,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '~/utils';

/**
 * BKL: 랜딩 페이지 (NEW 대화) 입력창 아래에 표시되는 기능 안내 carousel.
 *
 *   사용자 요청: "@ 기능 / 기간필터 / 쿼리강화 / 좌측 문서검색 4개 + 1-2개 추가".
 *   추가 카드: 인용 출처 확인, iManage 연동. 총 6개.
 *
 *   디자인: 가로 scroll-snap carousel + 좌우 화살표. 깔끔하고 미니멀.
 */

interface FeatureCard {
  icon: React.ReactNode;
  title: string;
  description: string;
  hint?: string;
}

const FEATURES: FeatureCard[] = [
  {
    icon: <AtSign className="h-5 w-5" />,
    title: '사건 참조',
    description:
      '채팅 입력 첫머리에 @ 를 입력하면 사건을 참조할 수 있습니다. 참조된 사건은 쿼리 강화의 컨텍스트로 활용됩니다.',
    hint: '줄 첫머리에 @ → 사건 검색',
  },
  {
    icon: <Filter className="h-5 w-5" />,
    title: '필터 — 기간 · 확장자 · 사건 · 문서',
    description:
      '입력바 좌측 필터 아이콘으로 검색 범위를 좁힙니다. 사건/문서를 선택하면 해당 범위 안에서만 검색됩니다.',
    hint: '선택 범위 밖 문서는 검색 결과에서 제외',
  },
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: '쿼리 강화',
    description:
      '쿼리 작성이 막막할 때, 토글을 켜고 메시지를 보내면 LLM 이 후보 쿼리 3개를 제안합니다.',
    hint: '쿼리 작성에 어려움이 있을 때',
  },
  {
    icon: <FileSearch className="h-5 w-5" />,
    title: '문서 직접 검색',
    description:
      '좌측 사이드바의 "문서 검색" 페이지에서 키워드로 직접 검색합니다. 답변 없이 문서만 빠르게.',
    hint: '자연어 답변 없이 결과만 볼 때',
  },
  {
    icon: <Quote className="h-5 w-5" />,
    title: '인용 출처 확인',
    description:
      'AI 답변의 [1] [2] 인용을 클릭하면 우측 패널에 원문 청크가 표시됩니다. 근거를 즉시 확인하세요.',
    hint: '환각/오류 검증의 핵심',
  },
  {
    icon: <ExternalLink className="h-5 w-5" />,
    title: 'iManage 연동',
    description:
      '출처 패널의 "iManage 에서 보기" 로 원본을 바로 엽니다. 모든 확장자 (.pdf, .docx, .msg 등) 지원.',
    hint: '검색 → 검토 → 원본 한번에',
  },
];

export default function BklFeatureCarousel() {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      ro.disconnect();
    };
  }, [updateArrows]);

  const scrollBy = (dx: number) => {
    scrollerRef.current?.scrollBy({ left: dx, behavior: 'smooth' });
  };

  return (
    // BKL: 입력창과 동일 폭 (max-w-3xl / xl:max-w-4xl).
    <div className="mx-auto mt-4 w-full max-w-3xl px-2 xl:max-w-4xl">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-medium text-text-tertiary">
          시작하기 — 핵심 기능 안내
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="이전"
            disabled={!canLeft}
            onClick={() => scrollBy(-320)}
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-light',
              'text-text-secondary transition-colors',
              canLeft
                ? 'hover:border-border-medium hover:bg-surface-hover hover:text-text-primary'
                : 'cursor-not-allowed opacity-40',
            )}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="다음"
            disabled={!canRight}
            onClick={() => scrollBy(320)}
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-light',
              'text-text-secondary transition-colors',
              canRight
                ? 'hover:border-border-medium hover:bg-surface-hover hover:text-text-primary'
                : 'cursor-not-allowed opacity-40',
            )}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className={cn(
          'flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-1 pb-2',
          // hide scrollbar
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {FEATURES.map((f) => (
          <article
            key={f.title}
            className={cn(
              'group flex h-[160px] w-[280px] shrink-0 snap-start flex-col gap-2 rounded-xl border border-border-light',
              'bg-surface-primary p-3.5 transition-colors hover:border-border-medium hover:bg-surface-hover',
            )}
          >
            <div className="flex items-center gap-2 text-text-primary">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                {f.icon}
              </span>
              <h3 className="truncate text-sm font-semibold">{f.title}</h3>
            </div>
            {/* description: 3줄 핏 (line-clamp-3) */}
            <p className="line-clamp-3 text-xs leading-relaxed text-text-secondary">
              {f.description}
            </p>
            {f.hint && (
              <p className="mt-auto truncate text-[11px] italic text-text-tertiary">
                {f.hint}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
