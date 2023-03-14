import React, { useState, useRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { useSelector, useDispatch } from 'react-redux';
import { setSubmission, setModel, setCustomGpt } from '~/store/submitSlice';
import { setNewConvo } from '~/store/convoSlice';
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

export default function ModelDialog({ mutate, setModelSave, handleSaveState }) {
  const dispatch = useDispatch();
  const { modelMap, initial } = useSelector((state) => state.models);
  const [chatGptLabel, setChatGptLabel] = useState('');
  const [promptPrefix, setPromptPrefix] = useState('');
  const [saveText, setSaveText] = useState('Save');
  const [required, setRequired] = useState(false);
  const inputRef = useRef(null);
  const updateCustomGpt = manualSWR(`/api/customGpts/`, 'post');

  const selectHandler = (e) => {
    if (chatGptLabel.length === 0) {
      e.preventDefault();
      setRequired(true);
      inputRef.current.focus();
      return;
    }
    dispatch(setCustomGpt({ chatGptLabel, promptPrefix }));
    dispatch(setModel('chatgptCustom'));
    handleSaveState(chatGptLabel.toLowerCase());
    // Set new conversation
    dispatch(setNewConvo());
    dispatch(setSubmission({}));
  };

  const saveHandler = (e) => {
    e.preventDefault();
    setModelSave(true);
    const value = chatGptLabel.toLowerCase();

    if (chatGptLabel.length === 0) {
      setRequired(true);
      inputRef.current.focus();
      return;
    }

    updateCustomGpt.trigger({ value, chatGptLabel, promptPrefix });

    mutate();
    setSaveText((prev) => prev + 'd!');
    setTimeout(() => {
      setSaveText('Enregistrer');
    }, 2500);

    dispatch(setCustomGpt({ chatGptLabel, promptPrefix }));
    dispatch(setModel('chatgptCustom'));
    // dispatch(setDisabled(false));
  };

  if (
    chatGptLabel !== 'chatgptCustom' &&
    modelMap[chatGptLabel.toLowerCase()] &&
    !initial[chatGptLabel.toLowerCase()] &&
    saveText === 'Save'
  ) {
    setSaveText('Update');
  } else if (!modelMap[chatGptLabel.toLowerCase()] && saveText === 'Update') {
    setSaveText('Save');
  }

  const requiredProp = required ? { required: true } : {};

  return (
    <DialogContent className="shadow-2xl dark:bg-gray-800">
      <DialogHeader>
        <DialogTitle className="text-gray-800 dark:text-white">Personnalisez ChatGPT</DialogTitle>
        <DialogDescription className="text-gray-600 dark:text-gray-300">
          Remarque : il est souvent préférable de placer les instructions importantes dans votre message plutôt que dans le 
          préfixe.{' '}
          <a
            href="https://platform.openai.com/docs/guides/chat/instructing-chat-models"
            target="_blank"
            rel="noopener noreferrer"
          >
            <u>Plus d'info ici</u>
          </a>
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label
            htmlFor="chatGptLabel"
            className="text-right"
          >
            Nom personnalisé
          </Label>
          <Input
            id="chatGptLabel"
            value={chatGptLabel}
            ref={inputRef}
            onChange={(e) => setChatGptLabel(e.target.value)}
            placeholder="Donner un nom personnalisé à ChatGPT"
            className=" col-span-3 shadow-[0_0_10px_rgba(0,0,0,0.10)] outline-none placeholder:text-gray-400 invalid:border-red-400 invalid:text-red-600 invalid:placeholder-red-600 invalid:placeholder-opacity-70 invalid:ring-opacity-10 focus:ring-0 focus:invalid:border-red-400 focus:invalid:ring-red-300 dark:border-none dark:bg-gray-700
              dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:invalid:border-red-600 dark:invalid:text-red-300 dark:invalid:placeholder-opacity-80 dark:focus:border-none  dark:focus:border-transparent dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0 dark:focus:invalid:ring-red-600 dark:focus:invalid:ring-opacity-50"
            {...requiredProp}
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label
            htmlFor="promptPrefix"
            className="text-right"
          >
            Prefixe du Prompt 
          </Label>
          <TextareaAutosize
            id="promptPrefix"
            value={promptPrefix}
            onChange={(e) => setPromptPrefix(e.target.value)}
            placeholder="Définir des instructions personnalisées. La valeur par défaut est : 'Vous êtes ChatGPT, un puissant modèle de langage entraîné par OpenAI.'"
            className="col-span-3 flex h-20 w-full resize-none rounded-md border border-gray-300 bg-transparent py-2 px-3 text-sm shadow-[0_0_10px_rgba(0,0,0,0.10)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-none dark:bg-gray-700 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-none dark:focus:border-transparent dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0"
          />
        </div>
      </div>
      <DialogFooter>
        <DialogClose className="dark:hover:gray-400 border-gray-700">Annuler</DialogClose>
        <Button
          style={{ backgroundColor: 'rgb(16, 163, 127)' }}
          onClick={saveHandler}
          className="inline-flex h-10 items-center justify-center rounded-md border-none py-2 px-4 text-sm font-semibold text-white transition-colors dark:text-gray-200"
        >
          {saveText}
        </Button>
        <DialogClose
          onClick={selectHandler}
          className="inline-flex h-10 items-center justify-center rounded-md border-none bg-gray-900 py-2 px-4 text-sm font-semibold text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 dark:focus:ring-gray-400 dark:focus:ring-offset-gray-900"
        >
          Selectionner
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  );
}
