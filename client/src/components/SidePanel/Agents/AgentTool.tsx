import React, { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import {
  OGDialog,
  TrashIcon,
  CircleHelpIcon,
  useToastContext,
  OGDialogTrigger,
  OGDialogTemplate,
} from '@librechat/client';
import type { TPlugin } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function AgentTool({
  tool,
  regularTools,
}: {
  tool: string;
  regularTools?: TPlugin[];
  agent_id?: string;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const updateUserPlugins = useUpdateUserPluginsMutation();
  const { getValues, setValue } = useFormContext<AgentForm>();

  const [isFocused, setIsFocused] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  if (!regularTools) {
    return null;
  }

  const currentTool = regularTools.find((t) => t.pluginKey === tool);

  if (!currentTool) {
    return null;
  }

  const removeTool = (toolId: string) => {
    if (toolId) {
      updateUserPlugins.mutate(
        { pluginKey: toolId, action: 'uninstall', auth: {}, isEntityTool: true },
        {
          onError: (error: unknown) => {
            showToast({ message: `Error while deleting the tool: ${error}`, status: 'error' });
          },
          onSuccess: () => {
            const remainingToolIds = getValues('tools')?.filter((id: string) => id !== toolId);
            setValue('tools', remainingToolIds);
            showToast({ message: 'Tool deleted successfully', status: 'success' });
          },
        },
      );
    }
  };

  return (
    <OGDialog>
      <div
        className="group relative flex w-full items-center gap-1 rounded-lg p-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => {
          // Check if focus is moving to a child element
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsFocused(false);
          }
        }}
      >
        <div className="flex grow items-center">
          {currentTool.icon && (
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full">
              <div
                className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-center bg-no-repeat dark:bg-white/20"
                style={{
                  backgroundImage: `url(${currentTool.icon})`,
                  backgroundSize: 'cover',
                }}
              />
            </div>
          )}
          <div
            className="grow px-2 py-1.5"
            style={{ textOverflow: 'ellipsis', wordBreak: 'break-all', overflow: 'hidden' }}
          >
            <AccordionPrimitive.Header asChild>
              <AccordionPrimitive.Trigger asChild>
               <div
                  role="button"
                  className={cn(
                    'flex grow items-center gap-1 rounded bg-transparent p-0 text-left transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                  )}
                >
                  {currentTool.metadata.icon && (
                    <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full">
                      <div
                        className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-center bg-no-repeat dark:bg-white/20"
                        style={{
                          backgroundImage: `url(${currentTool.metadata.icon})`,
                          backgroundSize: 'cover',
                        }}
                      />
                    </div>
                  )}
                  <div
                    className="grow px-2 py-1.5"
                    style={{ textOverflow: 'ellipsis', wordBreak: 'break-all', overflow: 'hidden' }}
                  >
                    {currentTool.metadata.name}
                  </div>
                  <div className="flex items-center">
                    {/* Container for grouped checkbox and chevron */}
                    <div className="relative flex items-center">
                      {/* Grouped checkbox and chevron that slide together */}
                      <div
                        className={cn(
                          'flex items-center gap-2 transition-all duration-300',
                          isHovering || isFocused ? '-translate-x-8' : 'translate-x-0',
                        )}
                      >
                        <div
                          data-checkbox-container
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1"
                        >
                          <Checkbox
                            id={`select-all-${currentTool.tool_id}`}
                            checked={selectedTools.length === currentTool.tools?.length}
                            onCheckedChange={(checked) => {
                              if (currentTool.tools) {
                                const newSelectedTools = checked
                                  ? currentTool.tools.map((t) => t.tool_id)
                                  : [];
                                updateFormTools(newSelectedTools);
                              }
                            }}
                            className={cn(
                              'h-4 w-4 rounded border border-gray-300 transition-all duration-200 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500',
                              isExpanded ? 'visible' : 'pointer-events-none invisible',
                            )}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                const checkbox = e.currentTarget as HTMLButtonElement;
                                checkbox.click();
                              }
                            }}
                            tabIndex={isExpanded ? 0 : -1}
                          />
                        </div>

                        <div
                          className={cn(
                            'pointer-events-none flex h-4 w-4 items-center justify-center transition-transform duration-300',
                            isExpanded ? 'rotate-180' : '',
                          )}
                          aria-hidden="true"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </div>
                      </div>

                      {/* Delete button slides in from behind */}
                      <div
                        className={cn(
                          'absolute right-0 transition-all duration-300',
                          isHovering || isFocused
                            ? 'translate-x-0 opacity-100'
                            : 'translate-x-8 opacity-0',
                        )}
                      >
                        <OGDialogTrigger asChild>
                         <div
                            role="button"
                            className={cn(
                              'flex h-7 w-7 items-center justify-center rounded transition-colors duration-200',
                              'hover:bg-gray-200 dark:hover:bg-gray-700',
                              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                              'focus:translate-x-0 focus:opacity-100',
                            )}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Delete ${currentTool.metadata.name}`}
                            tabIndex={0}
                            onFocus={() => setIsFocused(true)}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </div>
                        </OGDialogTrigger>
                      </div>
                    </div>
                  </div>
                </div>
              </AccordionPrimitive.Trigger>
            </AccordionPrimitive.Header>
            {currentTool.name}
          </div>
        </div>

        <OGDialogTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded transition-all duration-200',
              'hover:bg-gray-200 dark:hover:bg-gray-700',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
              'focus:opacity-100',
              isHovering || isFocused ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            aria-label={`Delete ${currentTool.name}`}
            tabIndex={0}
            onFocus={() => setIsFocused(true)}
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </OGDialogTrigger>
      </div>
      <OGDialogTemplate
        showCloseButton={false}
        title={localize('com_ui_delete_tool')}
        className="max-w-[450px]"
        main={
          <>
            <div className="flex w-full flex-col items-start gap-2 text-sm text-text-secondary">
              <p>
                {localize('com_ui_delete_tool_confirm')}{' '}
                <strong>&quot;{currentTool.name}&quot;</strong>?
              </p>
              {currentTool.description && (
                <div className="flex items-start gap-2">
                  <CircleHelpIcon className="h-4 w-4 flex-shrink-0 text-text-secondary" />
                  <p className="text-sm">{currentTool.description}</p>
                </div>
              )}
            </div>
          </>
        }
        selection={{
          selectHandler: () => removeTool(tool),
          selectClasses:
            'bg-red-700 hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-800 text-white',
          selectText: localize('com_ui_delete'),
        }}
      />
    </OGDialog>
  );
}
