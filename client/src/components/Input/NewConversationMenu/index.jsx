import React, { useState, useEffect } from 'react';
import { useRecoilValue, useRecoilState } from 'recoil';
import EditPresetDialog from '../../Endpoints/EditPresetDialog';
import EndpointItems from './EndpointItems';
import PresetItems from './PresetItems';
import { Trash2 } from 'lucide-react';
import FileUpload from './FileUpload';
import getIcon from '~/utils/getIcon';
import { useDeletePresetMutation, useCreatePresetMutation } from '~/data-provider';
import { Button } from '../../ui/Button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../ui/DropdownMenu.tsx';
import { Dialog, DialogTrigger } from '../../ui/Dialog.tsx';
import DialogTemplate from '../../ui/DialogTemplate';

import store from '~/store';

export default function NewConversationMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [presetModelVisible, setPresetModelVisible] = useState(false);
  const [preset, setPreset] = useState(false);

  const availableEndpoints = useRecoilValue(store.availableEndpoints);
  const [presets, setPresets] = useRecoilState(store.presets);

  const conversation = useRecoilValue(store.conversation) || {};
  const { endpoint, conversationId } = conversation;
  const { newConversation } = store.useConversation();

  const deletePresetsMutation = useDeletePresetMutation();
  const createPresetMutation = useCreatePresetMutation();

  const importPreset = jsonData => {
    createPresetMutation.mutate(
      { ...jsonData },
      {
        onSuccess: data => {
          setPresets(data);
        },
        onError: error => {
          console.error('Error uploading the preset:', error);
        }
      }
    );
  };

  // update the default model when availableModels changes
  // typically, availableModels changes => modelsFilter or customGPTModels changes
  useEffect(() => {
    const isInvalidConversation = !availableEndpoints.find(e => e === endpoint);
    if (conversationId == 'new' && isInvalidConversation) {
      newConversation();
    }
  }, [availableEndpoints]);

  // save selected model to localstoreage
  useEffect(() => {
    if (endpoint) {
      const lastSelectedModel = JSON.parse(localStorage.getItem('lastSelectedModel')) || {};
      localStorage.setItem('lastConversationSetup', JSON.stringify(conversation));
      localStorage.setItem(
        'lastSelectedModel',
        JSON.stringify({ ...lastSelectedModel, [endpoint]: conversation.model })
      );
    }
  }, [conversation]);

  // set the current model
  const onSelectEndpoint = newEndpoint => {
    setMenuOpen(false);

    if (!newEndpoint) return;
    else {
      newConversation({}, { endpoint: newEndpoint });
    }
  };

  // set the current model
  const onSelectPreset = newPreset => {
    setMenuOpen(false);
    if (!newPreset) return;
    else {
      newConversation({}, newPreset);
    }
  };

  const onChangePreset = preset => {
    setPresetModelVisible(true);
    setPreset(preset);
  };

  const clearAllPresets = () => {
    deletePresetsMutation.mutate({ arg: {} });
  };

  const onDeletePreset = preset => {
    deletePresetsMutation.mutate({ arg: preset });
  };

  const icon = getIcon({
    size: 32,
    ...conversation,
    isCreatedByUser: false,
    error: false,
    button: true
  });

  return (
    <Dialog>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={`group relative mb-[-12px] ml-0 mt-[-8px] items-center rounded-md border-0 p-1 outline-none focus:ring-0 focus:ring-offset-0 dark:data-[state=open]:bg-opacity-50 md:left-1 md:ml-[-12px] md:pl-1`}
          >
            {icon}
            <span className="max-w-0 overflow-hidden whitespace-nowrap px-0 text-slate-600 transition-all group-hover:max-w-[80px] group-hover:px-2 group-data-[state=open]:max-w-[80px] group-data-[state=open]:px-2 dark:text-slate-300">
              New Topic
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="min-w-[300px] dark:bg-gray-700"
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

          <DropdownMenuLabel className="flex items-center dark:text-gray-300">
            <span>Select a Preset</span>
            <div className="flex-1" />
            <FileUpload onFileSelected={importPreset} />
            <Dialog>
              <DialogTrigger asChild>
                <label
                  htmlFor="file-upload"
                  className=" mr-1 flex h-[32px] h-auto cursor-pointer  items-center rounded bg-transparent px-2 py-1 text-xs font-medium font-normal text-gray-600 transition-colors hover:bg-slate-200 hover:text-red-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-green-500"
                >
                  {/* <Button
                  type="button"
                  className="h-auto bg-transparent px-2 py-1 text-xs font-medium font-normal text-red-700 hover:bg-slate-200 hover:text-red-700 dark:bg-transparent dark:text-red-400 dark:hover:bg-gray-800 dark:hover:text-red-400"
                > */}
                  <Trash2 className="mr-1 flex w-[22px] items-center stroke-1" />
                  Clear All
                  {/* </Button> */}
                </label>
              </DialogTrigger>
              <DialogTemplate
                title="Clear presets"
                description="Are you sure you want to clear all presets? This is irreversible."
                selection={{
                  selectHandler: clearAllPresets,
                  selectClasses: 'bg-red-600 hover:bg-red-700 dark:hover:bg-red-800 text-white',
                  selectText: 'Clear'
                }}
              />
            </Dialog>
          </DropdownMenuLabel>
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
                onDeletePreset={onDeletePreset}
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
