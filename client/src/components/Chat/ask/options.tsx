import { Check } from 'lucide-react';
import { cn } from '~/utils';

export interface AskOption {
  label: string;
  value: string;
}

/**
 * The single option-row list shared by every `ask_user_question` surface
 * (composer popover and chat card), so the same question looks and behaves
 * identically wherever it renders. Numbered badges double as the popover's
 * digit shortcuts; multi-select swaps the number for a check.
 */
export default function AskOptions({
  options,
  multiSelect,
  checked,
  selected,
  locked,
  onActivate,
  optionRefs,
  listRef,
  className,
}: {
  options: AskOption[];
  multiSelect: boolean;
  checked: number[];
  selected?: number | null;
  locked: boolean;
  onActivate: (index: number) => void;
  optionRefs?: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  listRef?: React.RefObject<HTMLDivElement>;
  className?: string;
}) {
  return (
    <div ref={listRef} className={className}>
      {options.map((option, index) => {
        const isChecked = multiSelect && checked.includes(index);
        return (
          <button
            key={option.value}
            ref={(el) => {
              if (optionRefs) {
                optionRefs.current[index] = el;
              }
            }}
            type="button"
            role={multiSelect ? 'checkbox' : undefined}
            aria-checked={multiSelect ? isChecked : undefined}
            disabled={locked}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-text-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy',
              selected === index ? 'bg-surface-active' : 'hover:bg-surface-hover',
              locked && 'cursor-not-allowed opacity-60',
            )}
            onClick={() => onActivate(index)}
          >
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-medium tabular-nums transition-colors',
                isChecked
                  ? 'bg-surface-submit text-white'
                  : 'bg-surface-tertiary text-text-secondary',
              )}
            >
              {isChecked ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
            </span>
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
