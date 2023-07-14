import React from 'react';
import { Settings2 } from 'lucide-react';
export default function AdjustToneButton({ onClick }) {
  const clickHandler = (e) => {
    e.preventDefault();
    onClick();
  };
  return (
    <button
      onClick={clickHandler}
      className="group absolute bottom-11 right-0 flex h-[100%] w-[50px] items-center justify-center bg-transparent p-1 text-gray-500 lg:-right-11 lg:bottom-0"
    >
      <div className="m-1 mr-0 rounded-md p-2 pb-[10px] pt-[10px] group-hover:bg-gray-100 group-disabled:hover:bg-transparent dark:group-hover:bg-gray-900 dark:group-hover:text-gray-400 dark:group-disabled:hover:bg-transparent">
        <Settings2 size="1em" />
      </div>
    </button>
  );
}
