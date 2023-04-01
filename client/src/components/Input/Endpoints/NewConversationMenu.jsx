import React, { useState, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import EditPresetDialog from '../../Endpoints/EditPresetDialog';
import EndpointItems from './EndpointItems';
import PresetItems from './PresetItems';
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

export default function NewConversationMenu() {
  // const [modelSave, setModelSave] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [presetModelVisible, setPresetModelVisible] = useState(false);
  const [preset, setPreset] = useState(false);

  // const models = useRecoilValue(store.models);
  const availableEndpoints = useRecoilValue(store.availableEndpoints);
  // const setCustomGPTModels = useSetRecoilState(store.customGPTModels);
  const presets = useRecoilValue(store.presets);

  const conversation = useRecoilValue(store.conversation) || {};
  const { endpoint, conversationId } = conversation;
  // const { model, promptPrefix, chatGptLabel, conversationId } = conversation;
  const { newConversation } = store.useConversation();

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
  const onSelectEndpoint = newEndpoint => {
    setMenuOpen(false);

    if (!newEndpoint) return;
    else if (newEndpoint === endpoint) return;
    else {
      newConversation({}, { endpoint: newEndpoint });
    }
  };

  // set the current model
  const onSelectPreset = newPreset => {
    setMenuOpen(false);
    if (!newPreset) return;
    // else if (newEndpoint === endpoint) return;
    else {
      newConversation({}, newPreset);
    }
  };

  const onChangePreset = preset => {
    setPresetModelVisible(true);
    setPreset(preset);
  };

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
          className="min-w-56 dark:bg-gray-700"
          onCloseAutoFocus={event => event.preventDefault()}
        >
          <DropdownMenuLabel className="dark:text-gray-300">Select an Endpoint</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={endpoint}
            onValueChange={onSelectEndpoint}
            className="overflow-y-auto"
          >
            {availableEndpoints.length ? (
              <EndpointItems
                endpoints={availableEndpoints}
                onSelect={onSelectEndpoint}
              />
            ) : (
              <DropdownMenuLabel className="dark:text-gray-300">No endpoint available.</DropdownMenuLabel>
            )}
          </DropdownMenuRadioGroup>

          <div className="mt-6 w-full" />

          <DropdownMenuLabel className="dark:text-gray-300">Select a Preset</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            onValueChange={onSelectPreset}
            className="overflow-y-auto"
          >
            {presets.length ? (
              <PresetItems
                presets={presets}
                onSelect={onSelectPreset}
                onChangePreset={onChangePreset}
              />
            ) : (
              <DropdownMenuLabel className="dark:text-gray-300">No preset yet.</DropdownMenuLabel>
            )}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditPresetDialog
        open={presetModelVisible}
        onOpenChange={setPresetModelVisible}
        preset={preset}
      />
    </Dialog>
  );
}
