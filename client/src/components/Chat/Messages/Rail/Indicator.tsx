import { memo } from 'react';
import type { RailEntry } from './types';
import { ribDimsFor, RIB_ROW_HEIGHT } from './geometry';
import { cn } from '~/utils';

/** `shrink-0` is load-bearing: the ribs are flex items in a scrolling column, so
 *  without it every row compresses to its content the moment the rail overflows —
 *  halving the hit target of every rib in exactly the long lists the rail exists
 *  to navigate. */
const indicatorButtonClasses = cn(
  'flex w-full shrink-0 items-center justify-end rounded-sm transition-opacity duration-300',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy',
);

const dimIndicatorClasses =
  'opacity-40 group-hover/nav:opacity-100 group-focus-within/nav:opacity-100';

export const Indicator = memo(function Indicator({
  entry,
  isInView,
  isCurrent,
  isFocused,
  label,
  tabIndex,
  onSelect,
}: {
  entry: RailEntry;
  /** The row intersects the viewport — the soft band around where you are. */
  isInView: boolean;
  /** The row you are reading: the rail's single "you are here" mark. */
  isCurrent: boolean;
  /** The rib the pointer or keyboard is previewing right now. */
  isFocused: boolean;
  label: string;
  tabIndex: number;
  onSelect: (id: string) => void;
}) {
  const dims = ribDimsFor(entry, isCurrent);
  const isEmphasized = isCurrent || isFocused;
  let tone = 'bg-text-tertiary';
  if (isEmphasized) {
    tone = 'bg-text-primary';
  } else if (isInView) {
    tone = 'bg-text-secondary';
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(entry.id);
      }}
      className={cn(
        indicatorButtonClasses,
        isEmphasized || isInView ? 'opacity-100' : dimIndicatorClasses,
      )}
      style={{ height: RIB_ROW_HEIGHT }}
      aria-label={label}
      aria-current={isCurrent ? 'true' : undefined}
      tabIndex={tabIndex}
      data-msg-id={entry.id}
    >
      <span
        className={cn(
          'block rounded-full',
          entry.isEnd === true || entry.isStart === true ? 'mr-[4.5px]' : '',
          tone,
        )}
        style={{ width: dims.baseW, height: dims.baseH }}
      />
    </button>
  );
});
export const chevronButtonClasses = cn(
  '-mr-1 rounded-md p-0.5 text-text-tertiary opacity-40 transition-[color,opacity] duration-300',
  'group-hover/nav:text-text-secondary group-hover/nav:opacity-100',
  'group-focus-within/nav:text-text-secondary group-focus-within/nav:opacity-100',
  'group-hover/nav:hover:text-text-primary',
  'group-hover/nav:disabled:opacity-30 group-focus-within/nav:disabled:opacity-30',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy',
);
