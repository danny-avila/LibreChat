import React, { useState, useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import axios from 'axios';
import ModelDialog from './ModelDialog';
import MenuItems from './MenuItems';
import { swr } from '~/utils/fetchers';
import { getIconOfModel } from '~/utils';

import { Button } from '../../ui/Button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../ui/DropdownMenu.tsx';
import { Dialog } from '../../ui/Dialog.tsx';

import store from '~/store';

export default function ModelMenu() {
  const [modelSave, setModelSave] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const models = useRecoilValue(store.models);
  const availableModels = useRecoilValue(store.availableModels);
  const setCustomGPTModels = useSetRecoilState(store.customGPTModels);

  const conversation = useRecoilValue(store.conversation) || {};
  const { model, promptPrefix, chatGptLabel, conversationId } = conversation;
  const { newConversation } = store.useConversation();

  // fetch the list of saved chatgptCustom
  const { data, isLoading, mutate } = swr(`/api/customGpts`, res => {
    const fetchedModels = res.map(modelItem => ({
      ...modelItem,
      name: modelItem.chatGptLabel,
      model: 'chatgptCustom'
    }));

    setCustomGPTModels(fetchedModels);
  });

  // useEffect(() => {
  //   mutate();
  //   try {
  //     const lastSelected = JSON.parse(localStorage.getItem('model'));

  //     if (lastSelected === 'chatgptCustom') {
  //       return;
  //     } else if (initial[lastSelected]) {
  //       dispatch(setModel(lastSelected));
  //     }
  //   } catch (err) {
  //     console.log(err);
  //   }

  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, []);

  // update the default model when availableModels changes
  // typically, availableModels changes => modelsFilter or customGPTModels changes
  useEffect(() => {
    if (conversationId == 'new') {
      newConversation();
    }
  }, [availableModels]);

  // save selected model to localstoreage
  useEffect(() => {
    if (model) localStorage.setItem('model', JSON.stringify({ model, chatGptLabel, promptPrefix }));
  }, [model]);

  // set the current model
  const onChange = (newModel, value = null) => {
    setMenuOpen(false);

    if (!newModel) {
      return;
    } else if (newModel === model && value === chatGptLabel) {
      // bypass if not changed
      return;
    } else if (newModel === 'chatgptCustom' && value === null) {
      // return;
    } else if (newModel !== 'chatgptCustom') {
      newConversation({
        model: newModel,
        chatGptLabel: null,
        promptPrefix: null
      });
    } else if (newModel === 'chatgptCustom') {
      const targetModel = models.find(element => element.value == value);
      if (targetModel) {
        const chatGptLabel = targetModel?.chatGptLabel;
        const promptPrefix = targetModel?.promptPrefix;
        newConversation({
          model: newModel,
          chatGptLabel,
          promptPrefix
        });
      }
    }
  };

  const onOpenChange = open => {
    mutate();
    if (!open) {
      setModelSave(false);
    }
  };

  const handleSaveState = value => {
    if (!modelSave) {
      return;
    }

    setCustomGPTModels(value);
    setModelSave(false);
  };

  const defaultColorProps = [
    'text-gray-500',
    'hover:bg-gray-100',
    'hover:bg-opacity-20',
    'disabled:hover:bg-transparent',
    'dark:data-[state=open]:bg-gray-800',
    'dark:hover:bg-opacity-20',
    'dark:hover:bg-gray-900',
    'dark:hover:text-gray-400',
    'dark:disabled:hover:bg-transparent'
  ];

  const chatgptColorProps = [
    'text-green-700',
    'data-[state=open]:bg-green-100',
    'dark:text-emerald-300',
    'hover:bg-green-100',
    'disabled:hover:bg-transparent',
    'dark:data-[state=open]:bg-green-900',
    'dark:hover:bg-opacity-50',
    'dark:hover:bg-green-900',
    'dark:hover:text-gray-100',
    'dark:disabled:hover:bg-transparent'
  ];

  const colorProps = model === 'chatgpt' ? chatgptColorProps : defaultColorProps;
  const icon = getIconOfModel({
    size: 32,
    sender: chatGptLabel || model,
    isCreatedByUser: false,
    model,
    chatGptLabel,
    promptPrefix,
    error: false,
    button: true
  });

  return (
    <Dialog onOpenChange={onOpenChange}>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            // style={{backgroundColor: 'rgb(16, 163, 127)'}}
            className={`absolute top-[0.25px] mb-0 ml-1 items-center rounded-md border-0 p-1 outline-none md:ml-0 ${colorProps.join(
              ' '
            )} focus:ring-0 focus:ring-offset-0 disabled:top-[0.25px] dark:data-[state=open]:bg-opacity-50 md:top-1 md:left-1 md:pl-1 md:disabled:top-1`}
          >
            {icon}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-56 dark:bg-gray-700"
          onCloseAutoFocus={event => event.preventDefault()}
        >
          <DropdownMenuLabel className="dark:text-gray-300">Select a Model</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={chatGptLabel || model}
            onValueChange={onChange}
            className="overflow-y-auto"
          >
            {availableModels.length ? (
              <MenuItems
                models={availableModels}
                onSelect={onChange}
              />
            ) : (
              <DropdownMenuLabel className="dark:text-gray-300">No model available.</DropdownMenuLabel>
            )}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <ModelDialog
        mutate={mutate}
        setModelSave={setModelSave}
        handleSaveState={handleSaveState}
      />
    </Dialog>
  );
}
