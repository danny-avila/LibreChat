import React from 'react';

import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './Dialog.tsx';

export default function DialogTemplate({ title, description, main, buttons, selection }) {
  const { selectHandler, selectClasses, selectText } = selection;

  const defaultSelect = "bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 dark:focus:ring-gray-400 dark:focus:ring-offset-gray-900"
  return (
    <DialogContent className="shadow-2xl dark:bg-gray-800">
      <DialogHeader>
        <DialogTitle className="text-gray-800 dark:text-white">{title}</DialogTitle>
        <DialogDescription className="text-gray-600 dark:text-gray-300">
          {description}
        </DialogDescription>
      </DialogHeader>
      {/* <div className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4"> //input template

        </div> 
        <div className="grid grid-cols-4 items-center gap-4">
          <Label
            htmlFor="promptPrefix"
            className="text-right"
          >
            Prompt Prefix
          </Label>
          <TextareaAutosize
            id="promptPrefix"
            value={promptPrefix}
            onChange={(e) => setPromptPrefix(e.target.value)}
            placeholder="Set custom instructions. Defaults to: 'You are ChatGPT, a large language model trained by OpenAI.'"
            className="col-span-3 flex h-20 w-full resize-none rounded-md border border-gray-300 bg-transparent py-2 px-3 text-sm shadow-[0_0_10px_rgba(0,0,0,0.10)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-none dark:bg-gray-700 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-none dark:focus:border-transparent dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0"
          />
        </div>
      </div> */}
      {main ? main : null}
      <DialogFooter>
        <DialogClose className="dark:hover:gray-400 border-gray-700">Cancel</DialogClose>
        { buttons ? buttons : null}
        <DialogClose
          onClick={selectHandler}
          className={`${selectClasses || defaultSelect} inline-flex h-10 items-center justify-center rounded-md border-none py-2 px-4 text-sm font-semibold`}
        >
          {selectText}
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  );
}
