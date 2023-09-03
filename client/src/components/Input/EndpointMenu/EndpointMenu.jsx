/* eslint-disable react-hooks/exhaustive-deps */
import { Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRecoilValue, useRecoilState } from 'recoil';
import { useDeletePresetMutation, useCreatePresetMutation } from 'librechat-data-provider';
import { getIcon, EditPresetDialog } from '~/components/Endpoints';
import EndpointItems from './EndpointItems';
import PresetItems from './PresetItems';
import FileUpload from './FileUpload';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Dialog,
  DialogTrigger,
} from '~/components/ui/';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { cn, cleanupPreset, getDefaultConversation } from '~/utils';
import { useLocalize } from '~/hooks';

import store from '~/store';

export default function NewConversationMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPresets, setShowPresets] = useState(true);
  const [showEndpoints, setShowEndpoints] = useState(true);
  const [presetModelVisible, setPresetModelVisible] = useState(false);
  const [preset, setPreset] = useState(false);
  const [conversation, setConversation] = useRecoilState(store.conversation) || {};
  const [messages, setMessages] = useRecoilState(store.messages);
  const availableEndpoints = useRecoilValue(store.availableEndpoints);
  const endpointsConfig = useRecoilValue(store.endpointsConfig);
  const [presets, setPresets] = useRecoilState(store.presets);
  const modularEndpoints = new Set(['gptPlugins', 'anthropic', 'google', 'openAI']);

  const { endpoint, conversationId } = conversation;
  const { newConversation } = store.useConversation();

  const deletePresetsMutation = useDeletePresetMutation();
  const createPresetMutation = useCreatePresetMutation();

  const importPreset = (jsonData) => {
    createPresetMutation.mutate(
      { ...jsonData },
      {
        onSuccess: (data) => {
          setPresets(data);
        },
        onError: (error) => {
          console.error('Error uploading the preset:', error);
        },
      },
    );
  };

  const onFileSelected = (jsonData) => {
    const jsonPreset = { ...cleanupPreset({ preset: jsonData, endpointsConfig }), presetId: null };
    importPreset(jsonPreset);
  };

  // update the default model when availableModels changes
  // typically, availableModels changes => modelsFilter or customGPTModels changes
  useEffect(() => {
    const isInvalidConversation = !availableEndpoints.find((e) => e === endpoint);
    if (conversationId == 'new' && isInvalidConversation) {
      newConversation();
    }
  }, [availableEndpoints]);

  // save selected model to localStorage
  useEffect(() => {
    if (endpoint) {
      const lastSelectedModel = JSON.parse(localStorage.getItem('lastSelectedModel')) || {};
      localStorage.setItem(
        'lastSelectedModel',
        JSON.stringify({ ...lastSelectedModel, [endpoint]: conversation.model }),
      );
      localStorage.setItem('lastConversationSetup', JSON.stringify(conversation));
    }

    if (endpoint === 'bingAI') {
      const lastBingSettings = JSON.parse(localStorage.getItem('lastBingSettings')) || {};
      const { jailbreak, toneStyle } = conversation;
      localStorage.setItem(
        'lastBingSettings',
        JSON.stringify({ ...lastBingSettings, jailbreak, toneStyle }),
      );
    }
  }, [conversation]);

  // set the current model
  const onSelectEndpoint = (newEndpoint) => {
    setMenuOpen(false);
    if (!newEndpoint) {
      return;
    } else {
      newConversation({}, { endpoint: newEndpoint });
    }
  };

  // set the current model
  const isModular = modularEndpoints.has(endpoint);
  const onSelectPreset = (newPreset) => {
    setMenuOpen(false);
    if (!newPreset) {
      return;
    }

    if (
      isModular &&
      modularEndpoints.has(newPreset?.endpoint) &&
      endpoint === newPreset?.endpoint
    ) {
      const currentConvo = getDefaultConversation({
        conversation,
        endpointsConfig,
        preset: newPreset,
      });

      setConversation(currentConvo);
      setMessages(messages);
      return;
    }

    newConversation({}, newPreset);
  };

  const onChangePreset = (preset) => {
    setPresetModelVisible(true);
    setPreset(preset);
  };

  const clearAllPresets = () => {
    deletePresetsMutation.mutate({ arg: {} });
  };

  const onDeletePreset = (preset) => {
    deletePresetsMutation.mutate({ arg: preset });
  };

  const icon = getIcon({
    size: 32,
    ...conversation,
    isCreatedByUser: false,
    error: false,
    button: true,
  });

  const localize = useLocalize();

  return (
    <Dialog className="z-[100]">
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            id="new-conversation-menu"
            data-testid="new-conversation-menu"
            variant="outline"
            className={
              'group relative mb-[-12px] ml-1 mt-[-8px] items-center rounded-md border-0 p-1 outline-none focus:ring-0 focus:ring-offset-0 dark:data-[state=open]:bg-opacity-50 md:left-1 md:ml-0 md:ml-[-12px] md:pl-1'
            }
          >
            {icon}
            <span className="max-w-0 overflow-hidden whitespace-nowrap px-0 text-slate-600 transition-all group-hover:max-w-[80px] group-hover:px-2 group-data-[state=open]:max-w-[80px] group-data-[state=open]:px-2 dark:text-slate-300">
              {localize('com_endpoint_new_topic')}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="z-[100] w-[375px] dark:bg-gray-900 md:w-96"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenuLabel
            className="cursor-pointer dark:text-gray-300"
            onClick={() => setShowEndpoints((prev) => !prev)}
          >
            {showEndpoints ? localize('com_endpoint_hide') : localize('com_endpoint_show')}{' '}
            {localize('com_endpoint')}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={endpoint}
            onValueChange={onSelectEndpoint}
            className="flex flex-col gap-1 overflow-y-auto"
          >
            {showEndpoints &&
              (availableEndpoints.length ? (
                <EndpointItems
                  selectedEndpoint={endpoint}
                  endpoints={availableEndpoints}
                  onSelect={onSelectEndpoint}
                />
              ) : (
                <DropdownMenuLabel className="dark:text-gray-300">
                  {localize('com_endpoint_not_available')}
                </DropdownMenuLabel>
              ))}
          </DropdownMenuRadioGroup>

          <div className="mt-2 w-full" />

          <DropdownMenuLabel className="flex items-center dark:text-gray-300">
            <span
              className="mr-auto cursor-pointer "
              onClick={() => setShowPresets((prev) => !prev)}
            >
              {showPresets ? localize('com_endpoint_hide') : localize('com_endpoint_show')}{' '}
              {localize('com_endpoint_examples')}
            </span>
            <FileUpload onFileSelected={onFileSelected} />
            <Dialog>
              <DialogTrigger asChild>
                <label
                  htmlFor="file-upload"
                  className="mr-1 flex h-[32px] h-auto cursor-pointer  items-center rounded bg-transparent px-2 py-1 text-xs font-medium font-normal text-gray-600 transition-colors hover:bg-slate-200 hover:text-red-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-green-500"
                >
                  {/* <Button
                  type="button"
                  className="h-auto bg-transparent px-2 py-1 text-xs font-medium font-normal text-red-700 hover:bg-slate-200 hover:text-red-700 dark:bg-transparent dark:text-red-400 dark:hover:bg-gray-800 dark:hover:text-red-400"
                > */}
                  <Trash2 className="mr-1 flex w-[22px] items-center stroke-1" />
                  {localize('com_endpoint_clear_all')}
                  {/* </Button> */}
                </label>
              </DialogTrigger>
              <DialogTemplate
                title="Clear presets"
                description="Are you sure you want to clear all presets? This is irreversible."
                selection={{
                  selectHandler: clearAllPresets,
                  selectClasses: 'bg-red-600 hover:bg-red-700 dark:hover:bg-red-800 text-white',
                  selectText: 'Clear',
                }}
              />
            </Dialog>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            onValueChange={onSelectPreset}
            className={cn(
              'overflow-y-auto overflow-x-hidden',
              showEndpoints ? 'max-h-[210px]' : 'max-h-[315px]',
            )}
          >
            {showPresets &&
              (presets.length ? (
                <PresetItems
                  presets={presets}
                  onSelect={onSelectPreset}
                  onChangePreset={onChangePreset}
                  onDeletePreset={onDeletePreset}
                />
              ) : (
                <DropdownMenuLabel className="dark:text-gray-300">
                  {localize('com_endpoint_no_presets')}
                </DropdownMenuLabel>
              ))}
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
