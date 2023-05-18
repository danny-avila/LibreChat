import React from 'react';

import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './Dialog.tsx';
import { cn } from '~/utils/';

export default function DialogTemplate({
  title,
  description,
  main,
  buttons,
  leftButtons,
  selection,
  className
}) {
  const { selectHandler, selectClasses, selectText } = selection || {};

  const defaultSelect =
    'bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 dark:focus:ring-gray-400 dark:focus:ring-offset-gray-900';
  return (
    <DialogContent className={cn('shadow-2xl dark:bg-gray-800', className || '')}>
      <DialogHeader>
        <DialogTitle className="text-gray-800 dark:text-white">{title}</DialogTitle>
        <DialogDescription className="text-gray-600 dark:text-gray-300">
          {description}
        </DialogDescription>
      </DialogHeader>
      {main ? main : null}
      <DialogFooter>
        <div>{leftButtons ? leftButtons : null}</div>
        <div className="flex gap-2">
          <DialogClose className="dark:hover:gray-400 border-gray-700">Cancel</DialogClose>
          {buttons ? buttons : null}
          {selection ? (
            <DialogClose
              onClick={selectHandler}
              className={`${
                selectClasses || defaultSelect
              } inline-flex h-10 items-center justify-center rounded-md border-none px-4 py-2 text-sm font-semibold`}
            >
              {selectText}
            </DialogClose>
          ) : null}
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
