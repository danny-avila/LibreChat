import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { Pencil, Send, Sparkles } from 'lucide-react';
import { cn } from '~/utils';
import type { BklQueryCandidate, BklQueryChoicesPayload } from '~/utils/bklFilter';

type Props = {
  payload: BklQueryChoicesPayload;
  onSubmit: (query: string) => void;
  isSubmitting?: boolean;
};

const CUSTOM_ID = '__custom__';

const QueryChoicesPanel: React.FC<Props> = ({ payload, onSubmit, isSubmitting = false }) => {
  const candidates = payload?.candidates ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');
  const customRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (selectedId === CUSTOM_ID) customRef.current?.focus();
  }, [selectedId]);

  const selectedCandidate = useMemo<BklQueryCandidate | null>(() => {
    if (!selectedId || selectedId === CUSTOM_ID) return null;
    return candidates.find((c) => c.id === selectedId) ?? null;
  }, [selectedId, candidates]);

  const submittable = useMemo(() => {
    if (isSubmitting) return false;
    if (selectedCandidate) return true;
    return selectedId === CUSTOM_ID && customText.trim().length > 0;
  }, [customText, isSubmitting, selectedCandidate, selectedId]);

  const handleSubmit = useCallback(() => {
    if (!submittable) return;
    const q = selectedCandidate?.query ?? customText.trim();
    if (q) onSubmit(q);
  }, [customText, onSubmit, selectedCandidate, submittable]);

  return (
    <div className="w-full rounded-2xl border border-border-medium bg-surface-primary p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
        <div>
          <p className="text-sm font-semibold text-text-primary">
            {candidates.length > 0
              ? '검색을 더 정확하게 — 어느 방향으로 좁힐까요?'
              : 'AI가 제안할 만한 강화 방향을 찾지 못했습니다. 직접 다시 입력해주세요.'}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            카드를 클릭해 선택한 뒤 우측 하단 전송을 누르세요.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {candidates.map((c) => {
          const isSelected = selectedId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId((prev) => (prev === c.id ? null : c.id))}
              className={cn(
                'flex w-full flex-col gap-1.5 rounded-xl border px-3.5 py-3 text-left transition',
                isSelected
                  ? 'border-border-xheavy bg-surface-active-alt ring-1 ring-border-heavy'
                  : 'border-border-light bg-surface-primary hover:border-border-medium hover:bg-surface-hover',
              )}
              aria-pressed={isSelected}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-tertiary text-[10px] font-bold uppercase text-text-secondary">
                  {c.id}
                </span>
                <span className="text-sm font-medium leading-snug text-text-primary">{c.query}</span>
              </div>
              {c.rationale && (
                <p className="ml-7 text-[11px] leading-relaxed text-text-secondary">
                  {c.rationale}
                </p>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setSelectedId((prev) => (prev === CUSTOM_ID ? null : CUSTOM_ID))}
          className={cn(
            'flex w-full flex-col gap-2 rounded-xl border px-3.5 py-3 text-left transition',
            selectedId === CUSTOM_ID
              ? 'border-border-xheavy bg-surface-active-alt ring-1 ring-border-heavy'
              : 'border-border-light bg-surface-primary hover:border-border-medium hover:bg-surface-hover',
            candidates.length % 2 === 0 ? '' : 'sm:col-span-2',
          )}
          aria-pressed={selectedId === CUSTOM_ID}
        >
          <div className="flex items-start gap-2">
            <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">직접 입력</span>
          </div>
          {selectedId === CUSTOM_ID && (
            <textarea
              ref={customRef}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder="원하는 쿼리를 입력하세요."
              rows={2}
              className="ml-6 mt-1 w-[calc(100%-1.5rem)] resize-none rounded-md border border-border-medium bg-surface-secondary px-2.5 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
            />
          )}
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-[11px] text-text-tertiary">
          {payload.chunks_used > 0 && <span>참조 문서 {payload.chunks_used}개 기반</span>}
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!submittable}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition',
            submittable
              ? 'bg-surface-submit text-white hover:bg-surface-submit-hover'
              : 'cursor-not-allowed bg-surface-tertiary text-text-tertiary',
          )}
        >
          <Send className="h-4 w-4" />
          전송
        </button>
      </div>
    </div>
  );
};

export default QueryChoicesPanel;
