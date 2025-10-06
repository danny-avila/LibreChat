import React, { useState, useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import {
  TrashIcon,
  OGDialog,
  OGDialogTrigger,
  Label,
  OGDialogTemplate,
  useToastContext,
} from '@librechat/client';
import type { MCPPromptResponseArray } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function AgentPrompt({
  prompt,
  mcpPrompts,
}: {
  prompt: string;
  mcpPrompts?: MCPPromptResponseArray;
  agent_id?: string;
}) {
  const [isHovering, setIsHovering] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const updateUserPlugins = useUpdateUserPluginsMutation();
  const { getValues, setValue } = useFormContext<AgentForm>();
  const promptValues = getValues('mcp_prompts') || [];
  const savedPrompts = localStorage.getItem('agent-prompts') ?? '';
  if (!mcpPrompts) {
    return null;
  }
  const currentPrompt = mcpPrompts[prompt];
  const jsonSavedPrompts = savedPrompts ? JSON.parse(savedPrompts) : [];
  const isGroup = currentPrompt.prompts && currentPrompt.prompts.length > 0;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (
      (promptValues.length === 0 || promptValues.length !== jsonSavedPrompts.length) &&
      jsonSavedPrompts.length > 0
    ) {
      setValue('mcp_prompts', jsonSavedPrompts);
    }
  }, [promptValues.length, setValue, jsonSavedPrompts]);

  const getSelectedPrompts = () => {
    if (!currentPrompt) return [];
    let formPrompts = getValues('mcp_prompts') || [];
    if (formPrompts.length === 0 && savedPrompts) {
      formPrompts = JSON.parse(savedPrompts);
      const jsonSavedPrompts = JSON.parse(savedPrompts);
    }
    if (formPrompts) {
      return formPrompts.filter((prompt) => prompt === currentPrompt.promptKey);
    } else {
      return null;
    }
  };

  const removePrompt = (promptName: string) => {
    if (promptName) {
      const promptIdToRemove =
        isGroup && currentPrompt.prompts
          ? [promptName, ...currentPrompt.prompts.map((p) => p.name)]
          : [promptName];

      updateUserPlugins.mutate(
        { pluginKey: promptName, action: 'uninstall', auth: {}, isEntityTool: true },
        {
          onError: (error: unknown) => {
            showToast({ message: `Error while deleting the tool: ${error}`, status: 'error' });
          },
          onSuccess: () => {
            const remainingPrompts = getValues('mcp_prompts')?.filter(
              (promptName: string) => !promptIdToRemove.includes(promptName),
            );
            setValue('mcp_prompts', remainingPrompts);
            showToast({ message: 'Prompt deleted successfully', status: 'success' });
          },
        },
      );
      let agentPrompts = JSON.parse(localStorage.getItem('agent-prompts') || '[]');
      agentPrompts = agentPrompts.filter((prompts) => prompts !== promptName);
      localStorage.setItem('agent-prompts', JSON.stringify(agentPrompts));
    }
  };
  if (!currentPrompt) {
    return null;
  }
  const selectedPrompts = getSelectedPrompts();
  return (
    <OGDialog>
      <div
        className="group relative flex w-full items-center gap-1 rounded-lg p-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsFocused(false);
          }
        }}
      >
        <div className="flex grow items-center">
          <div
            className="grow px-2 py-1.5"
            style={{ textOverflow: 'ellipsis', wordBreak: 'break-all', overflow: 'hidden' }}
          >
            {currentPrompt.name}
          </div>
        </div>

        <OGDialogTrigger asChild>
          <div
            role="button"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded transition-all duration-200',
              'hover:bg-gray-200 dark:hover:bg-gray-700',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
              'focus:opacity-100',
              isHovering || isFocused ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Delete ${currentPrompt.name}`}
            tabIndex={0}
            onFocus={() => setIsFocused(true)}
          >
            <TrashIcon className="h-4 w-4" />
          </div>
        </OGDialogTrigger>
      </div>
      <OGDialogTemplate
        showCloseButton={false}
        title={localize('com_ui_delete_prompt')}
        mainClassName="px-0"
        className="max-w-[450px]"
        main={
          <Label className="text-left text-sm font-medium">
            {localize('com_ui_delete_prompt_confirm')}
          </Label>
        }
        selection={{
          selectHandler: () => removePrompt(currentPrompt.promptKey),
          selectClasses:
            'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 transition-color duration-200 text-white',
          selectText: localize('com_ui_delete'),
        }}
      />
    </OGDialog>
  );
}
