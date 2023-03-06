import React from 'react';
import { DropdownMenuRadioItem } from '../ui/DropdownMenu.tsx';
import { DialogTrigger } from '../ui/Dialog.tsx';

export default function ModelItem({ modelName, value }) {
  if (value === 'chatgptCustom') {
    return (
      <DialogTrigger className="w-full">
        <DropdownMenuRadioItem
          value={value}
          className="dark:font-semibold dark:hover:bg-gray-800 dark:text-gray-100"
        >
          {modelName}
          <sup>$</sup>
        </DropdownMenuRadioItem>
      </DialogTrigger>
    );
  }

  return (
    <DropdownMenuRadioItem
      value={value}
      className="dark:font-semibold dark:hover:bg-gray-800 dark:text-gray-100"
    >
      {modelName}
      {value === 'chatgpt' && <sup>$</sup>}
    </DropdownMenuRadioItem>
  );
}
