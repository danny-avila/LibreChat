import React from 'react';

type TPagesProps = {
  pages: number;
  pageNumber: number;
  setPageNumber: (pageNumber: number) => void;
  nextPage: () => Promise<void>;
  previousPage: () => Promise<void>;
};

export default function Pages({
  pageNumber,
  pages,
  nextPage,
  previousPage,
  setPageNumber,
}: TPagesProps) {
  const clickHandler =
    (func: () => Promise<void>) => async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      await func();
    };

  if (pageNumber > pages) {
    setPageNumber(pages);
  }

  return pageNumber == 1 && pages == 1 ? null : (
    <div className="m-auto mb-2 mt-4 flex items-center justify-center gap-2">
      <button
        onClick={clickHandler(previousPage)}
        className={
          'btn btn-small bg-transition m-auto flex gap-2 transition hover:bg-gray-800 disabled:text-gray-300 dark:text-white dark:disabled:text-gray-400' +
          (pageNumber <= 1 ? ' hidden-visibility' : '')
        }
        disabled={pageNumber <= 1}
      >
        &lt;&lt;
      </button>
      <span className="flex-none text-gray-400">
        {pageNumber} / {pages}
      </span>
      <button
        onClick={clickHandler(nextPage)}
        className={
          'btn btn-small bg-transition m-auto flex gap-2 transition hover:bg-gray-800 disabled:text-gray-300 dark:text-white dark:disabled:text-gray-400' +
          (pageNumber >= pages ? ' hidden-visibility' : '')
        }
        disabled={pageNumber >= pages}
      >
        &gt;&gt;
      </button>
    </div>
  );
}
