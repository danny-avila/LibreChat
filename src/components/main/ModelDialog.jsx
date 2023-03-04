// import React, { useState, useEffect, useRef } from 'react';
import React, { useState, useRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { useDispatch } from 'react-redux';
import { setModel, setCustomGpt } from '~/store/submitSlice';
import manualSWR from '~/utils/fetchers';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Label } from '../ui/Label.tsx';

import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/Dialog.tsx';

export default function ModelDialog({ mutate }) {
  const dispatch = useDispatch();
  const [chatGptLabel, setChatGptLabel] = useState('');
  const [promptPrefix, setPromptPrefix] = useState('');
  const [saveText, setSaveText] = useState('Save');
  const [required, setRequired] = useState(false);
  const inputRef = useRef(null);
  const updateCustomGpt = manualSWR('http://localhost:3050/customGpts/', 'post');

  const submitHandler = (e) => {
    if (chatGptLabel.length === 0) {
      e.preventDefault();
      setRequired(true);
      inputRef.current.focus();
      return;
    }
    dispatch(setCustomGpt({ chatGptLabel, promptPrefix }));
    dispatch(setModel('chatgptCustom'));
    // dispatch(setDisabled(false));
  };

  const saveHandler = (e) => {
    e.preventDefault();
    const value = chatGptLabel.toLowerCase();

    if (chatGptLabel.length === 0) {
      setRequired(true);
      inputRef.current.focus();
      return;
    }

      updateCustomGpt.trigger({ value, chatGptLabel, promptPrefix });

    mutate();
    setSaveText('Saved!');
    setTimeout(() => {
      setSaveText('Save');
    }, 2500);

    dispatch(setCustomGpt({ chatGptLabel, promptPrefix }));
    dispatch(setModel('chatgptCustom'));
    // dispatch(setDisabled(false));
  };

  const requiredProp = required ? { required: true } : {};

  return (
    <DialogContent className="dark:bg-gray-800">
      <DialogHeader>
        <DialogTitle>Customize ChatGPT</DialogTitle>
        <DialogDescription>
          Note: important instructions are often better placed in your message rather than the
          prefix.{' '}
          <a
            href="https://platform.openai.com/docs/guides/chat/instructing-chat-models"
            target="_blank"
            rel="noopener noreferrer"
          >
            <u>More info here</u>
          </a>
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label
            htmlFor="chatGptLabel"
            className="text-right"
          >
            Custom Name
          </Label>
          <Input
            id="chatGptLabel"
            value={chatGptLabel}
            ref={inputRef}
            onChange={(e) => setChatGptLabel(e.target.value)}
            placeholder="Set a custom name for ChatGPT"
            className="col-span-3 shadow-[0_0_10px_rgba(0,0,0,0.10)] invalid:border-red-400 invalid:text-red-600 invalid:placeholder-red-600
              invalid:placeholder-opacity-70 invalid:ring-opacity-20 focus:ring-opacity-20 focus:invalid:border-red-400 focus:invalid:ring-red-400 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)]  dark:invalid:border-red-600 dark:invalid:text-red-300 dark:invalid:placeholder-opacity-80 dark:focus:invalid:ring-red-600 dark:focus:invalid:ring-opacity-50"
            {...requiredProp}
          />
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
            className="col-span-3 flex h-20 w-full resize-none rounded-md border border-slate-300 bg-transparent py-2 px-3 text-sm shadow-[0_0_10px_rgba(0,0,0,0.10)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:ring-slate-400 dark:focus:ring-offset-slate-900"
          />
        </div>
      </div>
      <DialogFooter>
        <DialogClose>Cancel</DialogClose>
        <Button
          style={{ backgroundColor: 'rgb(16, 163, 127)' }}
          onClick={saveHandler}
          className="inline-flex h-10 items-center justify-center rounded-md border-none py-2 px-4 text-sm font-semibold text-white transition-colors"
        >
          {saveText}
        </Button>
        <DialogClose
          onClick={submitHandler}
          className="inline-flex h-10 items-center justify-center rounded-md border-none bg-slate-900 py-2 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 dark:focus:ring-slate-400 dark:focus:ring-offset-slate-900"
        >
          Submit
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  );
}
