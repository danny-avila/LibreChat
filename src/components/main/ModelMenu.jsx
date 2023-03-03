import React, { useState, useEffect } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { useSelector, useDispatch } from 'react-redux';
import { setModel, setDisabled, setCustomGpt } from '~/store/submitSlice';
import GPTIcon from '../svg/GPTIcon';
import BingIcon from '../svg/BingIcon';
import { Button } from '../ui/Button.tsx';
import { Input } from '../ui/Input.tsx';
import { Label } from '../ui/Label.tsx';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../ui/DropdownMenu.tsx';

import {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/Dialog.tsx';

export default function ModelMenu() {
  const dispatch = useDispatch();
  const { model } = useSelector((state) => state.submit);
  const [chatGptLabel, setChatGptLabel] = useState('');
  const [promptPrefix, setPromptPrefix] = useState('');
  const [required, setRequired] = useState(false);

  useEffect(() => {
    const lastSelectedModel = JSON.parse(localStorage.getItem('model'));
    if (lastSelectedModel && lastSelectedModel !== 'chatgptCustom') {
      dispatch(setModel(lastSelectedModel));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem('model', JSON.stringify(model));
  }, [model]);

  const onChange = (value) => {
    if (value === 'chatgptCustom') {
      // dispatch(setDisabled(true));
    } else {
      dispatch(setModel(value));
      dispatch(setDisabled(false));
    }
  };

  const submitHandler = (e) => {
    if (chatGptLabel.length === 0) {
      e.preventDefault();
      setRequired(true);
      return;
    }
    dispatch(setCustomGpt({ chatGptLabel, promptPrefix }));
    dispatch(setModel('chatgptCustom'));
    dispatch(setDisabled(false));
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

  const requiredProp = required ? { required: true } : {};

  const colorProps = model === 'chatgpt' ? chatgptColorProps : defaultColorProps;
  const icon = model === 'bingai' ? <BingIcon button={true} /> : <GPTIcon button={true} />;

  return (
    <Dialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            // style={{backgroundColor: 'rgb(16, 163, 127)'}}
            className={`absolute bottom-0.5 rounded-md border-0 p-1 pl-2 outline-none ${colorProps.join(
              ' '
            )} focus:ring-0 focus:ring-offset-0 disabled:bottom-0.5 md:bottom-1 md:left-2 md:pl-1 md:disabled:bottom-1`}
          >
            {icon}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuLabel>Select a Model</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={model}
            onValueChange={onChange}
          >
            <DropdownMenuRadioItem value="chatgpt">
              ChatGPT <sup>$</sup>
            </DropdownMenuRadioItem>
            <DialogTrigger asChild>
              <DropdownMenuRadioItem value="chatgptCustom">
                CustomGPT <sup>$</sup>
              </DropdownMenuRadioItem>
            </DialogTrigger>
            <DropdownMenuRadioItem value="bingai">BingAI</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="chatgptBrowser">ChatGPT</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Customize ChatGPT</DialogTitle>
          <DialogDescription>
            Note: important instructions are often better placed in your message rather than
            the prefix.{' '}
            <a href="https://platform.openai.com/docs/guides/chat/instructing-chat-models">
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
              onChange={(e) => setChatGptLabel(e.target.value)}
              placeholder="Set a custom name for ChatGPT"
              className="col-span-3 invalid:border-red-400 invalid:text-red-600 invalid:placeholder-red-600 invalid:placeholder-opacity-70
              focus:ring-opacity-20 focus:invalid:border-red-400 focus:invalid:ring-red-400 focus:invalid:ring-opacity-20"
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
              className="col-span-3 flex h-20 w-full resize-none rounded-md border border-slate-300 bg-transparent py-2 px-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-50 dark:focus:ring-slate-400 dark:focus:ring-offset-slate-900"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose>Cancel</DialogClose>
          <DialogClose
            onClick={submitHandler}
            className="inline-flex h-10 items-center justify-center rounded-md border-none bg-slate-900 py-2 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 dark:focus:ring-slate-400 dark:focus:ring-offset-slate-900"
          >
            Submit
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
