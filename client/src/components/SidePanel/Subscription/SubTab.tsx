import React from 'react';

export default function SubTab({
  isSelected,
  setIsSelected,
  title,
  desc,
}: {
  isSelected: boolean;
  setIsSelected: () => void;
  title: string | React.ReactNode;
  desc: string | React.ReactNode;
}) {
  return (
    <button
      className={`flex w-full flex-col gap-3 rounded-md border-2 p-5 transition ${
        isSelected ? 'border-green-500 bg-green-200 dark:text-black' : 'border-gray-300'
      }`}
      onClick={() => setIsSelected()}
    >
      <div
        className={`dark:text-gray w-full text-left text-[20px] font-extrabold text-black ${
          isSelected ? '' : 'dark:text-gray-200'
        }`}
      >
        {title}
      </div>
      <div className={`text-left ${!isSelected && 'text-gray-400'}`}>{desc}</div>
    </button>
  );
}
