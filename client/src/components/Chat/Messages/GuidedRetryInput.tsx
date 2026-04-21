import React, { useState, useCallback, memo } from 'react';

type GuidedRetryInputProps = {
  bklRid: string;
  onClose: () => void;
};

const GuidedRetryInput = memo(({ bklRid, onClose }: GuidedRetryInputProps) => {
  const [hint, setHint] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = hint.trim();
      if (!trimmed || isSubmitting) return;

      setIsSubmitting(true);

      const retryText = `[BKL_GUIDED_RETRY:${bklRid}] ${trimmed}`;

      window.dispatchEvent(
        new CustomEvent('bkl-guided-retry', { detail: { text: retryText } }),
      );

      setHint('');
      onClose();
    },
    [hint, bklRid, onClose, isSubmitting],
  );

  return (
    <div className="rounded-lg border border-border-medium bg-surface-primary p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">
          어떤 문서/정보를 찾고 계신가요?
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="예: 코원에너지 공개매수신고서..."
          className="min-w-0 flex-1 rounded-md border border-border-light bg-surface-secondary px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          autoFocus
        />
        <button
          type="submit"
          disabled={!hint.trim() || isSubmitting}
          className="whitespace-nowrap rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          보완 검색
        </button>
      </form>
    </div>
  );
});

GuidedRetryInput.displayName = 'GuidedRetryInput';

export default GuidedRetryInput;
