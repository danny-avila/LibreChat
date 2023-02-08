import React from 'react';
import { useSelector } from 'react-redux';

export default function Message({ sender, text, last = false, error = false }) {
  const { isSubmitting } = useSelector((state) => state.submit);
  const props = {
    className:
      'w-full border-b border-black/10 dark:border-gray-900/50 text-gray-800 dark:text-gray-100 group dark:bg-gray-800'
  };

  if (sender === 'GPT') {
    props.className =
      'w-full border-b border-black/10 dark:border-gray-900/50 text-gray-800 dark:text-gray-100 group bg-gray-50 dark:bg-[#444654]';
  }

  return (
    <div {...props}>
      <div className="m-auto flex gap-4 p-4 text-base md:max-w-2xl md:gap-6 md:py-6 lg:max-w-2xl lg:px-0 xl:max-w-3xl">
        <strong className="relative flex w-[30px] flex-col items-end">{sender}:</strong>
        <div className="relative flex w-[calc(100%-50px)] flex-col gap-1 whitespace-pre-wrap md:gap-3 lg:w-[calc(100%-115px)]">
          <div className="flex flex-grow flex-col gap-3">
            {!!error ? (
              <div className="flex flex min-h-[20px] flex-row flex-col items-start gap-4 gap-2 whitespace-pre-wrap text-red-500">
                <div className="rounded-md border border-red-500 bg-red-500/10 py-2 px-3 text-sm text-gray-600 dark:text-gray-100">
                  {text}
                </div>
              </div>
            ) : (
              <span>
                {text}
                {isSubmitting && last && sender === 'GPT' && <span className="blink">█</span>}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
