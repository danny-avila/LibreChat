import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setModel, setDisabled, setCustomGpt, setCustomModel } from '~/store/submitSlice';
import { setNewConvo } from '~/store/convoSlice';
import ModelDialog from './ModelDialog';
import MenuItems from './MenuItems';
import manualSWR from '~/utils/fetchers';
import { setModels } from '~/store/modelSlice';
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
  const [modelSave, setModelSave] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { model, customModel } = useSelector((state) => state.submit);
  const { models, modelMap, initial } = useSelector((state) => state.models);
  const { trigger } = manualSWR(`http://localhost:3080/api/customGpts`, 'get', (res) => {
    const fetchedModels = res.map((modelItem) => ({
      ...modelItem,
      name: modelItem.chatGptLabel
    }));

    dispatch(setModels(fetchedModels));
  });

  useEffect(() => {
    trigger();
    const lastSelected = JSON.parse(localStorage.getItem('model'));
    if (lastSelected && lastSelected !== 'chatgptCustom' && initial[lastSelected]) {
      dispatch(setModel(lastSelected));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem('model', JSON.stringify(model));
  }, [model]);

  const onChange = (value, custom = false) => {
    if (!value) {
      return;
    } else if (value === 'chatgptCustom') {
      // dispatch(setMessages([]));
    } else if (initial[value]) {
      dispatch(setModel(value));
      dispatch(setDisabled(false));
      dispatch(setCustomModel(null));
      if (custom) {
        trigger();
      }
    } else if (!initial[value]) {
      const chatGptLabel = modelMap[value]?.chatGptLabel;
      const promptPrefix = modelMap[value]?.promptPrefix;
      dispatch(setCustomGpt({ chatGptLabel, promptPrefix }));
      dispatch(setModel('chatgptCustom'));
      dispatch(setCustomModel(value));
      // if (custom) {
      //   setMenuOpen((prevOpen) => !prevOpen);
      // }
    } else if (!modelMap[value]) {
      dispatch(setCustomModel(null));
    }

    // Set new conversation
    dispatch(setNewConvo());
  };

  const onOpenChange = (open) => {
    if (!open) {
      setModelSave(false);
    }
  };

  const handleSaveState = (value) => {
    if (!modelSave) {
      return;
    }

    dispatch(setCustomModel(value));
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

  const isBing = model === 'bingai' || model === 'sydney';
  const colorProps = model === 'chatgpt' ? chatgptColorProps : defaultColorProps;
  const icon = isBing ? <BingIcon button={true} /> : <GPTIcon button={true} />;

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
            className={`absolute bottom-0.5 rounded-md border-0 p-1 pl-2 outline-none ${colorProps.join(
              ' '
            )} focus:ring-0 focus:ring-offset-0 disabled:bottom-0.5 dark:data-[state=open]:bg-opacity-50 md:bottom-1 md:left-2 md:pl-1 md:disabled:bottom-1`}
          >
            {icon}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56 dark:bg-gray-700">
          <DropdownMenuLabel className="dark:text-gray-300">Select a Model</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={customModel ? customModel : model}
            onValueChange={onChange}
            className="overflow-y-auto"
          >
            <MenuItems
              models={models}
              onSelect={onChange}
            />
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <ModelDialog
        mutate={trigger}
        modelMap={modelMap}
        setModelSave={setModelSave}
        handleSaveState={handleSaveState}
      />
    </Dialog>
  );
}
