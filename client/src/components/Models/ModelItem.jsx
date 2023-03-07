import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { DropdownMenuRadioItem } from '../ui/DropdownMenu.tsx';
import { DialogTrigger } from '../ui/Dialog.tsx';
import RenameButton from '../Conversations/RenameButton';
import TrashIcon from '../svg/TrashIcon';

export default function ModelItem({ modelName, value }) {
  const { initial } = useSelector((state) => state.models);
  const [isHovering, setIsHovering] = useState(false);

  if (value === 'chatgptCustom') {
    return (
      <DialogTrigger className="w-full">
        <DropdownMenuRadioItem
          value={value}
          className="dark:font-semibold dark:text-gray-100 dark:hover:bg-gray-800"
        >
          {modelName}
          <sup>$</sup>
        </DropdownMenuRadioItem>
      </DialogTrigger>
    );
  }

  const handleMouseOver = () => {
    setIsHovering(true);
  };

  const handleMouseOut = () => {
    setIsHovering(false);
  };

  const buttonClass = {
    className:
      'rounded-md m-0 text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
  };

  const showButtons = isHovering && !initial[value];

  return (
    <DropdownMenuRadioItem
      value={value}
      className="dark:font-semibold dark:text-gray-100 dark:hover:bg-gray-800"
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    >
      {modelName}
      {value === 'chatgpt' && <sup>$</sup>}

      {showButtons && (
        <>
          <RenameButton twcss={`ml-auto mr-2 ${buttonClass.className}`} />
          <button {...buttonClass}>
            <TrashIcon />
          </button>
        </>
      )}
    </DropdownMenuRadioItem>
  );
}
