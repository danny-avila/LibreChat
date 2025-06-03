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
    <div className="flex items-center justify-start gap-1 self-center bg-gray-700 pb-2 text-xs">
      <button
        className="hover-button rounded-md p-1 text-gray-400 hover:bg-gray-700 hover:text-gray-200 disabled:hover:text-gray-400"
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
      <span className="flex-shrink-0 tabular-nums">
        {currentIndex + 1} / {totalCount}
      </span>
      <button
        className="hover-button rounded-md p-1 text-gray-400 hover:bg-gray-700 hover:text-gray-200 disabled:hover:text-gray-400"
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
