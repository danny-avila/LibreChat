/* eslint-disable i18next/no-literal-string */
import { useState, useEffect } from 'react';
import { useToastContext } from '@librechat/client';
import { useGetUserQuery } from '~/data-provider/Auth';
import { useJurisdictionsQuery, useUpdateJurisdictionMutation } from '~/data-provider/CodeCan';

type JurisdictionPickerProps = {
  /** Tighter "hero" variant for Landing; default expands to fill its container. */
  compact?: boolean;
  /** Called after a successful save so the parent can dismiss/close. */
  onPicked?: (jurisdictionId: string) => void;
  /** Hide the heading copy (when the surrounding surface provides its own title). */
  hideHeader?: boolean;
};

export default function JurisdictionPicker({
  compact = false,
  onPicked,
  hideHeader = false,
}: JurisdictionPickerProps) {
  const { data: user } = useGetUserQuery();
  const { data: catalog, isLoading } = useJurisdictionsQuery();
  const { showToast } = useToastContext();

  const savedId = user?.personalization?.jurisdiction ?? catalog?.selected ?? null;
  const currentId = savedId ?? catalog?.default ?? null;
  const [pendingId, setPendingId] = useState<string | null>(currentId);

  useEffect(() => {
    setPendingId(currentId);
  }, [currentId]);

  const mutation = useUpdateJurisdictionMutation({
    onSuccess: (data) => {
      showToast({ message: 'Location updated.', status: 'success' });
      onPicked?.(data.preferences.jurisdiction);
    },
    onError: () => {
      showToast({ message: 'Could not update location. Try again.', status: 'error' });
      setPendingId(currentId);
    },
  });

  if (isLoading) {
    return (
      <div className="flex w-full items-center justify-center py-6 text-sm text-cc-slate-500 dark:text-dm-text-mute">
        Loading locations…
      </div>
    );
  }

  if (!catalog?.jurisdictions?.length) {
    return null;
  }

  const handleSelect = (id: string) => {
    if (mutation.isLoading) {
      return;
    }
    // Only skip the save when the user has already confirmed this choice on the server.
    // The "Active" pre-selection for new users is just a visual default — clicking it
    // must still persist so `hasPickedJurisdiction` flips and the picker dismisses.
    if (id === savedId) {
      return;
    }
    setPendingId(id);
    mutation.mutate(id);
  };

  return (
    <div className={compact ? 'w-full' : 'flex w-full flex-col gap-3'}>
      {!hideHeader && (
        <div className="flex items-center gap-2 px-1 pb-1">
          <span className="h-px flex-1 bg-[rgba(11,47,91,0.08)] dark:bg-white/[0.08]" />
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-cc-slate-400 dark:text-dm-text-faint">
            Choose your location
          </span>
          <span className="h-px flex-1 bg-[rgba(11,47,91,0.08)] dark:bg-white/[0.08]" />
        </div>
      )}
      <div
        className="-mx-2 flex max-h-[min(60vh,520px)] w-[calc(100%+1rem)] flex-col gap-2 overflow-y-auto px-2"
        style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
      >
        {catalog.jurisdictions.map((j) => {
          const selected = j.id === pendingId;
          return (
            <button
              key={j.id}
              type="button"
              onClick={() => handleSelect(j.id)}
              disabled={mutation.isLoading}
              className={
                'flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-colors duration-200 fade-in disabled:opacity-60 ' +
                (selected
                  ? 'border-signal-amber bg-paper-100 dark:border-signal-amber dark:bg-dm-surface2'
                  : 'border-[rgba(11,47,91,0.08)] bg-white hover:bg-paper-100 dark:border-white/[0.08] dark:bg-dm-surface dark:hover:bg-dm-surface2')
              }
            >
              <span
                className={
                  'min-h-[18px] w-[3px] flex-none self-stretch rounded-[2px] ' +
                  (selected ? 'bg-signal-amber' : 'bg-transparent')
                }
              />
              <span className="flex flex-1 flex-col">
                <span className="text-[14px] font-medium text-ink-800 dark:text-dm-text">
                  {j.displayName}
                </span>
                <span className="text-[12px] text-cc-slate-500 dark:text-dm-text-mute">
                  {j.shortLabel}
                </span>
              </span>
              {selected ? (
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-amber">
                  Active
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
