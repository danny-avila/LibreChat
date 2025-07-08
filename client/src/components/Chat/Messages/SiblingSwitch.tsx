import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { TMessageProps } from '~/common';
import { cn } from '~/utils';

type TSiblingSwitchProps = Pick<TMessageProps, 'siblingIdx' | 'siblingCount' | 'setSiblingIdx'>;

export default function SiblingSwitch({
  siblingIdx,
  siblingCount,
  setSiblingIdx,
}: TSiblingSwitchProps) {
  if (siblingIdx === undefined) {
    return null;
  } else if (siblingCount === undefined) {
    return null;
  }

  const previous = () => {
    setSiblingIdx && setSiblingIdx(siblingIdx - 1);
  };

  const next = () => {
    setSiblingIdx && setSiblingIdx(siblingIdx + 1);
  };

  const buttonStyle = cn(
    'hover-button rounded-lg p-1.5 text-text-secondary-alt transition-colors duration-200',
    'hover:text-text-primary hover:bg-surface-hover',
    'md:group-hover:visible md:group-focus-within:visible md:group-[.final-completion]:visible',
    'focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:outline-none',
  );

  return siblingCount > 1 ? (
    <nav
      className="visible flex items-center justify-center gap-2 self-center pt-0 text-xs"
      aria-label="Sibling message navigation"
    >
      <button
        className={buttonStyle}
        type="button"
        onClick={previous}
        disabled={siblingIdx == 0}
        aria-label="Previous sibling message"
        aria-disabled={siblingIdx == 0}
      >
        <ChevronLeft size="19" aria-hidden="true" />
      </button>
      <span
        className="flex-shrink-0 flex-grow tabular-nums"
        aria-live="polite"
        aria-atomic="true"
        role="status"
      >
        {siblingIdx + 1} / {siblingCount}
      </span>
      <button
        className={buttonStyle}
        type="button"
        onClick={next}
        disabled={siblingIdx == siblingCount - 1}
        aria-label="Next sibling message"
        aria-disabled={siblingIdx == siblingCount - 1}
      >
        <ChevronRight size="19" aria-hidden="true" />
      </button>
    </nav>
  ) : null;
}
