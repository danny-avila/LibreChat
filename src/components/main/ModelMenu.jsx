import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setModel } from '~/store/submitSlice';
import GPTIcon from '../svg/GPTIcon';
import { DropdownMenuCheckboxItemProps } from '@radix-ui/react-dropdown-menu';

import { Button } from '../ui/Button.tsx';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../ui/DropdownMenu.tsx';

export default function ModelMenu() {
  const dispatch = useDispatch();
  const { model } = useSelector((state) => state.submit);
  const onChange = (value) => {
    dispatch(setModel(value));
  };

  const defaultColorProps = [
    'text-gray-500',
    'hover:bg-gray-100',
    'disabled:hover:bg-transparent',
    'dark:hover:bg-gray-900',
    'dark:hover:text-gray-400',
    'dark:disabled:hover:bg-transparent'
  ];

  const chatgptColorProps = [
    'text-green-700',
    'dark:text-emerald-300',
    'hover:bg-green-100',
    'disabled:hover:bg-transparent',
    'dark:hover:bg-opacity-50',
    'dark:hover:bg-green-900',
    'dark:hover:text-gray-100',
    'dark:disabled:hover:bg-transparent'
  ];

  const colorProps = model === 'chatgpt' ? chatgptColorProps : defaultColorProps;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          // style={{backgroundColor: 'rgb(16, 163, 127)'}}
          className={`absolute bottom-0.5 rounded-md border-0 p-1 pl-2 outline-none ${colorProps.join(' ')} focus:ring-0 focus:ring-offset-0 disabled:bottom-0.5 md:pl-1 md:bottom-1 md:left-2 md:disabled:bottom-1`}
        >
          <GPTIcon button={true} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Select a Model</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={model}
          onValueChange={onChange}
        >
          <DropdownMenuRadioItem value="chatgpt">ChatGPT</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="davinci">Davinci</DropdownMenuRadioItem>
          {/* <DropdownMenuRadioItem value="right">Right</DropdownMenuRadioItem> */}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
