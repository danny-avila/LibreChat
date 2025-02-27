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

  return siblingCount > 1 ? (
    <div className="visible flex items-center justify-center gap-1 self-center pt-0 text-xs">
      <button
        className={cn(
          'hover-button rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:text-gray-400/70 dark:hover:bg-gray-700 dark:hover:text-gray-200 dark:disabled:hover:text-gray-400 md:group-hover:visible md:group-[.final-completion]:visible',
        )}
        type="button"
        onClick={previous}
        disabled={siblingIdx == 0}
      >
        <svg
          stroke="currentColor"
          fill="none"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          height="1em"
          width="1em"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span className="shrink-0 grow tabular-nums">
        {siblingIdx + 1} / {siblingCount}
      </span>
      <button
        className={cn(
          'hover-button rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:text-gray-400/70 dark:hover:bg-gray-700 dark:hover:text-gray-200 dark:disabled:hover:text-gray-400 md:group-hover:visible md:group-[.final-completion]:visible',
        )}
        type="button"
        onClick={next}
        disabled={siblingIdx == siblingCount - 1}
      >
        <svg
          stroke="currentColor"
          fill="none"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          height="1em"
          width="1em"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  ) : null;
}
