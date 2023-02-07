import React from 'react';

export default function Message({ sender, text }) {
  const props = {
    className:
      'group w-full border-b border-black/10 text-gray-800 dark:border-gray-900/50 dark:bg-gray-800 dark:text-gray-100'
  };

  if (sender === 'GPT') {
    props.className =
      'group w-full border-b border-black/10 bg-gray-100 text-gray-800 dark:border-gray-900/50 dark:bg-[#444654] dark:text-gray-100';
  }

  return (
    <div {...props}>
      <div className="m-auto flex gap-4 p-4 text-base md:max-w-2xl md:gap-6 md:py-6 lg:max-w-2xl lg:px-0 xl:max-w-3xl">
        <strong className="relative flex w-[30px] flex-col items-end">{sender}:</strong>
        <div className="relative flex w-[calc(100%-50px)] flex-col gap-1 whitespace-pre-wrap md:gap-3 lg:w-[calc(100%-115px)]">
          {text}
        </div>
      </div>
    </div>
  );
}
