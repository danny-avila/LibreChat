import type { TMessageProps } from '~/common';

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
    <div className="text-token-text-secondary flex items-center justify-center rounded-lg">
      <button
        className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-[#7D7D7D] hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-transparent dark:text-[#b4b4b4] dark:hover:bg-gray-700 dark:disabled:hover:bg-transparent"
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
          className="icon-md-heavy"
          height="1em"
          width="1em"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span className="px-0.5 text-sm font-medium tabular-nums">
        {siblingIdx + 1} / {siblingCount}
      </span>
      <button
        className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-[#7D7D7D] hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-transparent dark:text-[#b4b4b4] dark:hover:bg-gray-700 dark:disabled:hover:bg-transparent"
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
          className="icon-md-heavy"
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
