import { useEffect, useMemo, useRef, useState } from 'react';
import type { SetterOrUpdater } from 'recoil';
import { useRecoilState } from 'recoil';
import { Briefcase } from 'lucide-react';
import { removeCharIfLast, cn } from '~/utils';
import store from '~/store';
import type { BklMatterSelection } from '~/store/bkl';
import { filterMatters, useBklMattersQuery } from '~/data-provider/Matters/queries';
import type { BklMatter } from '~/data-provider/Matters/queries';

export default function BklMatterMention({
  setShowMentionPopover,
  textAreaRef,
}: {
  setShowMentionPopover: SetterOrUpdater<boolean>;
  textAreaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
}) {
  const [searchValue, setSearchValue] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data } = useBklMattersQuery();
  const [selectedMatters, setSelectedMatters] = useRecoilState(store.referenceBklMatters);
  const selectedSet = useMemo(
    () => new Set(selectedMatters.map((m) => m.matter_uid)),
    [selectedMatters],
  );

  const matches = useMemo(
    () =>
      filterMatters(data?.matters ?? [], searchValue, 40).filter(
        (m) => !selectedSet.has(m.matter_uid),
      ),
    [data?.matters, searchValue, selectedSet],
  );

  const close = () => {
    setShowMentionPopover(false);
    setSearchValue('');
    if (textAreaRef.current) {
      removeCharIfLast(textAreaRef.current, '@');
      textAreaRef.current.focus();
    }
  };

  const handleSelect = (m: BklMatter | undefined) => {
    if (!m) return;
    const item: BklMatterSelection = {
      matter_uid: m.matter_uid,
      label: m.case_number || m.matter_uid,
      sub: m.client || m.case_alias || undefined,
    };
    setSelectedMatters((prev) =>
      prev.some((p) => p.matter_uid === item.matter_uid) ? prev : [...prev, item],
    );
    close();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') return close();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % Math.max(1, matches.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + matches.length) % Math.max(1, matches.length));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      handleSelect(matches[activeIndex]);
    } else if (e.key === 'Backspace' && searchValue === '') {
      close();
    }
  };

  useEffect(() => setActiveIndex(0), [searchValue]);
  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  return (
    <div className="absolute bottom-28 z-10 w-full">
      <div className="rounded-2xl border border-border-light bg-surface-primary p-2 shadow-lg">
        <input
          ref={inputRef}
          placeholder="사건명 / 사건번호 / 별칭 / 의뢰인으로 검색"
          className="mb-1 w-full border-0 bg-transparent p-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
          autoComplete="off"
          value={searchValue}
          onKeyDown={onKey}
          onChange={(e) => setSearchValue(e.target.value)}
          onBlur={() => {
            closeTimerRef.current = setTimeout(() => setShowMentionPopover(false), 150);
          }}
        />
        {matches.length > 0 ? (
          <div className="max-h-72 overflow-y-auto">
            {matches.map((m, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={m.matter_uid}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelect(m);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors',
                    isActive
                      ? 'bg-surface-hover text-text-primary'
                      : 'bg-transparent text-text-primary hover:bg-surface-hover',
                  )}
                >
                  <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 overflow-hidden whitespace-nowrap">
                      <span className="shrink-0 text-sm font-medium">
                        {m.case_alias || m.matter_uid}
                      </span>
                      {m.case_number && (
                        <span className="shrink-0 text-[11px] tabular-nums text-text-tertiary">
                          #{m.case_number}
                        </span>
                      )}
                      {m.client && (
                        <span className="min-w-0 truncate text-[11px] text-text-tertiary">
                          · {m.client}
                        </span>
                      )}
                    </div>
                    {m.case_name && (
                      <div className="truncate text-xs text-text-secondary">{m.case_name}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-3 py-4 text-center text-xs text-text-tertiary">
            {searchValue ? '일치하는 사건이 없습니다.' : data ? '검색어를 입력하세요.' : '사건 목록을 불러오는 중...'}
          </div>
        )}
      </div>
    </div>
  );
}
