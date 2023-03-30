import React, { useState, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
// import ModelDialog from './ModelDialog';
import EndpointItems from './EndpointItems';
import { swr } from '~/utils/fetchers';
import getIcon from '~/utils/getIcon';

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

export default function EndpointMenu() {
  // const [modelSave, setModelSave] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // const models = useRecoilValue(store.models);
  const availableEndpoints = useRecoilValue(store.availableEndpoints);
  // const setCustomGPTModels = useSetRecoilState(store.customGPTModels);

  const conversation = useRecoilValue(store.conversation) || {};
  const { endpoint, conversationId } = conversation;
  // const { model, promptPrefix, chatGptLabel, conversationId } = conversation;
  const { newConversation } = store.useConversation();

  // fetch the list of saved chatgptCustom
  // const { data, isLoading, mutate } = swr(`/api/customGpts`, res => {
  //   const fetchedModels = res.map(modelItem => ({
  //     ...modelItem,
  //     name: modelItem.chatGptLabel,
  //     model: 'chatgptCustom'
  //   }));

  //   setCustomGPTModels(fetchedModels);
  // });

  // update the default model when availableModels changes
  // typically, availableModels changes => modelsFilter or customGPTModels changes
  useEffect(() => {
    if (conversationId == 'new') {
      newConversation();
    }
  }, [availableEndpoints]);

  // save selected model to localstoreage
  useEffect(() => {
    if (endpoint) localStorage.setItem('lastConversationSetup', JSON.stringify(conversation));
  }, [conversation]);

  // set the current model
  const onChange = (newEndpoint, value = null) => {
    setMenuOpen(false);

    if (!newEndpoint) return;
    else if (newEndpoint === endpoint) return;
    else {
      newConversation({}, newEndpoint);
    }
    // } else if (newModel === model && value === chatGptLabel) {
    //   // bypass if not changed
    //   return;
    // } else if (newModel === 'chatgptCustom' && value === null) {
    //   // return;
    // } else if (newModel !== 'chatgptCustom') {
    //   newConversation({
    //     model: newModel,
    //     chatGptLabel: null,
    //     promptPrefix: null
    //   });
    // } else if (newModel === 'chatgptCustom') {
    //   const targetModel = models.find(element => element.value == value);
    //   if (targetModel) {
    //     const chatGptLabel = targetModel?.chatGptLabel;
    //     const promptPrefix = targetModel?.promptPrefix;
    //     newConversation({
    //       model: newModel,
    //       chatGptLabel,
    //       promptPrefix
    //     });
    //   }
    // }
  };

  // const onOpenChange = open => {
  //   mutate();
  //   if (!open) {
  //     setModelSave(false);
  //   }
  // };

  // const handleSaveState = value => {
  //   if (!modelSave) {
  //     return;
  //   }

  //   setCustomGPTModels(value);
  //   setModelSave(false);
  // };

  // const defaultColorProps = [
  //   'text-gray-500',
  //   'hover:bg-gray-100',
  //   'hover:bg-opacity-20',
  //   'disabled:hover:bg-transparent',
  //   'dark:data-[state=open]:bg-gray-800',
  //   'dark:hover:bg-opacity-20',
  //   'dark:hover:bg-gray-900',
  //   'dark:hover:text-gray-400',
  //   'dark:disabled:hover:bg-transparent'
  // ];

  // const chatgptColorProps = [
  //   'text-green-700',
  //   'data-[state=open]:bg-green-100',
  //   'dark:text-emerald-300',
  //   'hover:bg-green-100',
  //   'disabled:hover:bg-transparent',
  //   'dark:data-[state=open]:bg-green-900',
  //   'dark:hover:bg-opacity-50',
  //   'dark:hover:bg-green-900',
  //   'dark:hover:text-gray-100',
  //   'dark:disabled:hover:bg-transparent'
  // ];

  // const colorProps = model === 'chatgpt' ? chatgptColorProps : defaultColorProps;
  const icon = getIcon({
    size: 32,
    ...conversation,
    isCreatedByUser: false,
    error: false,
    button: true
  });

  return (
    <Dialog
    // onOpenChange={onOpenChange}
    >
      <DropdownMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            // style={{backgroundColor: 'rgb(16, 163, 127)'}}
            className={`absolute top-[0.25px] mb-0 ml-1 items-center rounded-md border-0 p-1 outline-none focus:ring-0 focus:ring-offset-0 disabled:top-[0.25px] dark:data-[state=open]:bg-opacity-50 md:top-1 md:left-1 md:ml-0 md:pl-1 md:disabled:top-1`}
          >
            {icon}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-56 dark:bg-gray-700"
          onCloseAutoFocus={event => event.preventDefault()}
        >
          <DropdownMenuLabel className="dark:text-gray-300">Select an AI Endpoint</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={endpoint}
            onValueChange={onChange}
            className="overflow-y-auto"
          >
            {availableEndpoints.length ? (
              <EndpointItems
                endpoints={availableEndpoints}
                onSelect={onChange}
              />
            ) : (
              <DropdownMenuLabel className="dark:text-gray-300">No endpoint available.</DropdownMenuLabel>
            )}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* <ModelDialog
        mutate={mutate}
        setModelSave={setModelSave}
        handleSaveState={handleSaveState}
      /> */}
    </Dialog>
  );
}
