import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setModel, setDisabled } from '~/store/submitSlice';
import { setConversation } from '~/store/convoSlice';
import ModelDialog from './ModelDialog';
import MenuItems from './MenuItems';
// import useDidMountEffect from '~/hooks/useDidMountEffect';
// import { swr } from '~/utils/fetchers';
import manualSWR from '~/utils/fetchers';
// import { setMessages } from '~/store/messageSlice';
import { setModels } from '~/store/modelSlice';
// import ModelItem from './ModelItem';
import GPTIcon from '../svg/GPTIcon';
import BingIcon from '../svg/BingIcon';
import { Button } from '../ui/Button.tsx';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../ui/DropdownMenu.tsx';

import { Dialog } from '../ui/Dialog.tsx';

export default function ModelMenu() {
  const dispatch = useDispatch();
  const { model } = useSelector((state) => state.submit);
  const { models } = useSelector((state) => state.models);
  const { trigger } = manualSWR('http://localhost:3050/customGpts', 'get', (res) => {
    console.log('models data (response)', res);
    if (models.length + res.length === models.length) {
      return;
    }

    const fetchedModels = res.map((modelItem) => ({
      ...modelItem,
      name: modelItem.chatGptLabel
    }));

    dispatch(setModels(fetchedModels));
  });

  // useDidMountEffect(() => mutate(), [chatGptLabel]);

  useEffect(() => {
    const lastSelectedModel = JSON.parse(localStorage.getItem('model'));
    if (lastSelectedModel && lastSelectedModel !== 'chatgptCustom') {
      dispatch(setModel(lastSelectedModel));
    }

    const cachedModels = JSON.parse(localStorage.getItem('models'));
    if (cachedModels) {
      dispatch(setModels(cachedModels));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem('model', JSON.stringify(model));
  }, [model]);

  useEffect(() => {
    localStorage.setItem('models', JSON.stringify(models.slice(4)));
  }, [models]);

  const onChange = (value) => {
    if (!value) {
      return;
    } else if (value === 'chatgptCustom') {
      // dispatch(setMessages([]));
    } else {
      dispatch(setModel(value));
      dispatch(setDisabled(false));
    }
    // Set new conversation
    dispatch(
      setConversation({
        title: 'New Chat',
        error: false,
        conversationId: null,
        parentMessageId: null
      })
    );
  };

  const defaultColorProps = [
    'text-gray-500',
    'hover:bg-gray-100',
    'disabled:hover:bg-transparent',
    'dark:hover:bg-opacity-20',
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
            )} focus:ring-0 focus:ring-offset-0 disabled:bottom-0.5 dark:data-[state=open]:bg-gray-800 dark:data-[state=open]:bg-opacity-50 md:bottom-1 md:left-2 md:pl-1 md:disabled:bottom-1`}
          >
            {icon}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56 dark:bg-gray-700">
          <DropdownMenuLabel>Select a Model</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={model}
            onValueChange={onChange}
            className="overflow-y-auto"
          >
            <MenuItems models={models} />
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <ModelDialog mutate={trigger} />
    </Dialog>
  );
}
