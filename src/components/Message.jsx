import React from 'react';

export default function Message({ sender, text }) {
  return (
    <div className="m-auto flex gap-4 p-4 text-base md:max-w-2xl md:gap-6 md:py-6 lg:max-w-2xl lg:px-0 xl:max-w-3xl">
      <strong className="relative flex w-[30px] flex-col items-end">{sender}:</strong>
      <div className="relative flex w-[calc(100%-50px)] flex-col gap-1 whitespace-pre-wrap md:gap-3 lg:w-[calc(100%-115px)]">
        {text}
      </div>
    </div>
  );
}
