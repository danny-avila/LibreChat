interface ResultSwitcherProps {
  currentIndex: number;
  totalCount: number;
  onPrevious: () => void;
  onNext: () => void;
}

const ResultSwitcher: React.FC<ResultSwitcherProps> = ({
  currentIndex,
  totalCount,
  onPrevious,
  onNext,
}) => {
  if (totalCount <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-start gap-1 self-center border-t border-border-light bg-surface-secondary px-3 pb-2 pt-1.5 text-xs">
      <button
        className="rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary disabled:opacity-40 disabled:hover:bg-transparent"
        type="button"
        onClick={onPrevious}
        disabled={currentIndex === 0}
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
      <span className="flex-shrink-0 tabular-nums text-text-secondary">
        {currentIndex + 1} / {totalCount}
      </span>
      <button
        className="rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary disabled:opacity-40 disabled:hover:bg-transparent"
        type="button"
        onClick={onNext}
        disabled={currentIndex === totalCount - 1}
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
  );
};

export default ResultSwitcher;
