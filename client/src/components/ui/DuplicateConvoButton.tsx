import React from 'react';

export default function DuplicateConvoButton({ duplicateHandler }) {
  return (
    <button
      onClick={duplicateHandler}
      className="absolute bottom-[124px] right-6 z-10 cursor-pointer rounded-full border border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/10 dark:text-gray-200 md:bottom-[120px]"
    >
      拷贝对话
    </button>
  );
}
