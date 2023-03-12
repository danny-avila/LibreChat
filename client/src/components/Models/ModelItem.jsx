import React, { useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DropdownMenuRadioItem } from '../ui/DropdownMenu.tsx';
import { setModels } from '~/store/modelSlice';
import { Circle } from 'lucide-react';
import { DialogTrigger } from '../ui/Dialog.tsx';
import RenameButton from '../Conversations/RenameButton';
import TrashIcon from '../svg/TrashIcon';
import manualSWR from '~/utils/fetchers';

export default function ModelItem({ modelName, value, onSelect, id }) {
  const dispatch = useDispatch();
  const { customModel } = useSelector((state) => state.submit);
  const { initial } = useSelector((state) => state.models);
  const [isHovering, setIsHovering] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [currentName, setCurrentName] = useState(modelName);
  const [modelInput, setModelInput] = useState(modelName);
  const inputRef = useRef(null);
  const rename = manualSWR(`/api/customGpts`, 'post');
  const deleteCustom = manualSWR(`/api/customGpts/delete`, 'post', (res) => {
    const fetchedModels = res.data.map((modelItem) => ({
      ...modelItem,
      name: modelItem.chatGptLabel
    }));

    dispatch(setModels(fetchedModels));
  });

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

  if (initial[value]) {
    return (
      <DropdownMenuRadioItem
        value={value}
        className="dark:font-semibold dark:text-gray-100 dark:hover:bg-gray-800"
      >
        {modelName}
        {value === 'chatgpt' && <sup>$</sup>}
      </DropdownMenuRadioItem>
    );
  }

  const handleMouseOver = () => {
    setIsHovering(true);
  };

  const handleMouseOut = () => {
    setIsHovering(false);
  };

  const renameHandler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setRenaming(true);
    setTimeout(() => {
      inputRef.current.focus();
    }, 25);
  };

  const onRename = (e) => {
    e.preventDefault();
    setRenaming(false);
    if (modelInput === modelName) {
      return;
    }
    rename.trigger({
      prevLabel: currentName,
      chatGptLabel: modelInput,
      value: modelInput.toLowerCase()
    });
    setCurrentName(modelInput);
  };

  const onDelete = async (e) => {
    e.preventDefault();
    await deleteCustom.trigger({ _id: id });
    onSelect('chatgpt', true);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      onRename(e);
    }
  };

  const buttonClass = {
    className:
      'invisible group-hover:visible z-50 rounded-md m-0 text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
  };

  const itemClass = {
    className:
      'relative flex group cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm font-medium outline-none hover:bg-slate-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 dark:hover:bg-slate-700 dark:font-semibold dark:text-gray-100 dark:hover:bg-gray-800'
  };

  return (
    <span
      value={value}
      className={itemClass.className}
      onClick={(e) => {
        if (isHovering) {
          return;
        }
        onSelect(value, true);
      }}
    >
      {customModel === value && (
        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          <Circle className="h-2 w-2 fill-current" />
        </span>
      )}
      {renaming === true ? (
        <input
          ref={inputRef}
          key={id}
          type="text"
          className="pointer-events-auto z-50 m-0 mr-2 w-3/4 border border-blue-500 bg-transparent p-0 text-sm leading-tight outline-none"
          value={modelInput}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setModelInput(e.target.value)}
          // onBlur={onRename}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <div className="w-3/4 overflow-hidden">{modelInput}</div>
      )}

      {value === 'chatgpt' && <sup>$</sup>}
      <RenameButton
        twcss={`ml-auto mr-2 ${buttonClass.className}`}
        onRename={onRename}
        renaming={renaming}
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
        renameHandler={renameHandler}
      />
      <button
        {...buttonClass}
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
        onClick={onDelete}
      >
        <TrashIcon />
      </button>
    </span>
  );
}
