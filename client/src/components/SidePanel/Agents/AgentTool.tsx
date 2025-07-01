import React, { useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronDown } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import type { AgentToolType } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { Accordion, AccordionItem, AccordionContent } from '~/components/ui/Accordion';
import { OGDialog, OGDialogTrigger, Label, Checkbox } from '~/components/ui';
import { TrashIcon, CircleHelpIcon } from '~/components/svg';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function AgentTool({
  tool,
  allTools,
}: {
  tool: string;
  allTools?: Record<string, AgentToolType & { tools?: AgentToolType[] }>;
  agent_id?: string;
}) {
  const [isHovering, setIsHovering] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [hoveredToolId, setHoveredToolId] = useState<string | null>(null);
  const [accordionValue, setAccordionValue] = useState<string>('');
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const updateUserPlugins = useUpdateUserPluginsMutation();
  const { getValues, setValue } = useFormContext<AgentForm>();
  if (!allTools) {
    return null;
  }
  const currentTool = allTools[tool];
  const getSelectedTools = () => {
    if (!currentTool?.tools) return [];
    const formTools = getValues('tools') || [];
    return currentTool.tools.filter((t) => formTools.includes(t.tool_id)).map((t) => t.tool_id);
  };

  const updateFormTools = (newSelectedTools: string[]) => {
    const currentTools = getValues('tools') || [];
    const otherTools = currentTools.filter(
      (t: string) => !currentTool?.tools?.some((st) => st.tool_id === t),
    );
    setValue('tools', [...otherTools, ...newSelectedTools]);
  };

  const removeTool = (toolId: string) => {
    if (toolId) {
      const toolIdsToRemove =
        isGroup && currentTool.tools
          ? [toolId, ...currentTool.tools.map((t) => t.tool_id)]
          : [toolId];

      updateUserPlugins.mutate(
        { pluginKey: toolId, action: 'uninstall', auth: {}, isEntityTool: true },
        {
          onError: (error: unknown) => {
            showToast({ message: `Error while deleting the tool: ${error}`, status: 'error' });
          },
          onSuccess: () => {
            const remainingToolIds = getValues('tools')?.filter(
              (toolId: string) => !toolIdsToRemove.includes(toolId),
            );
            setValue('tools', remainingToolIds);
            showToast({ message: 'Tool deleted successfully', status: 'success' });
          },
        },
      );
    }
  };

  if (!currentTool) {
    return null;
  }

  const isGroup = currentTool.tools && currentTool.tools.length > 0;
  const selectedTools = getSelectedTools();
  const isExpanded = accordionValue === currentTool.tool_id;

  if (!isGroup) {
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
              aria-label={`Delete ${currentTool.metadata.name}`}
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
          mainClassName="px-0"
          className="max-w-[450px]"
          main={
            <Label className="text-left text-sm font-medium">
              {localize('com_ui_delete_tool_confirm')}
            </Label>
          }
          selection={{
            selectHandler: () => removeTool(currentTool.tool_id),
            selectClasses:
              'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 transition-color duration-200 text-white',
            selectText: localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    );
  }

  // Group tool with accordion
  return (
    <OGDialog>
      <Accordion type="single" value={accordionValue} onValueChange={setAccordionValue} collapsible>
        <AccordionItem value={currentTool.tool_id} className="group relative w-full border-none">
          <div
            className="relative flex w-full items-center gap-1 rounded-lg p-1 hover:bg-gray-50 dark:hover:bg-gray-800/50"
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
            <AccordionPrimitive.Header asChild>
              <AccordionPrimitive.Trigger asChild>
                <button
                  type="button"
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
                          <button
                            type="button"
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
                          </button>
                        </OGDialogTrigger>
                      </div>
                    </div>
                  </div>
                </button>
              </AccordionPrimitive.Trigger>
            </AccordionPrimitive.Header>
          </div>

          <AccordionContent className="relative ml-1 pt-1 before:absolute before:bottom-2 before:left-0 before:top-0 before:w-0.5 before:bg-border-medium">
            <div className="space-y-1">
              {currentTool.tools?.map((subTool) => (
                <label
                  key={subTool.tool_id}
                  htmlFor={subTool.tool_id}
                  className={cn(
                    'border-token-border-light hover:bg-token-surface-secondary flex cursor-pointer items-center rounded-lg border p-2',
                    'ml-2 mr-1 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
                  )}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                  }}
                  onMouseEnter={() => setHoveredToolId(subTool.tool_id)}
                  onMouseLeave={() => setHoveredToolId(null)}
                >
                  <Checkbox
                    id={subTool.tool_id}
                    checked={selectedTools.includes(subTool.tool_id)}
                    onCheckedChange={(_checked) => {
                      const newSelectedTools = selectedTools.includes(subTool.tool_id)
                        ? selectedTools.filter((t) => t !== subTool.tool_id)
                        : [...selectedTools, subTool.tool_id];
                      updateFormTools(newSelectedTools);
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        const checkbox = e.currentTarget as HTMLButtonElement;
                        checkbox.click();
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer rounded border border-gray-300 transition-[border-color] duration-200 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background dark:border-gray-600 dark:hover:border-gray-500"
                  />
                  <span className="text-token-text-primary">{subTool.metadata.name}</span>
                  {subTool.metadata.description && (
                    <Ariakit.HovercardProvider placement="left-start">
                      <div className="ml-auto flex h-6 w-6 items-center justify-center">
                        <Ariakit.HovercardAnchor
                          render={
                            <Ariakit.Button
                              className={cn(
                                'flex h-5 w-5 cursor-help items-center rounded-full text-text-secondary transition-opacity duration-200',
                                hoveredToolId === subTool.tool_id ? 'opacity-100' : 'opacity-0',
                              )}
                              aria-label={localize('com_ui_tool_info')}
                            >
                              <CircleHelpIcon className="h-4 w-4" />
                              <Ariakit.VisuallyHidden>
                                {localize('com_ui_tool_info')}
                              </Ariakit.VisuallyHidden>
                            </Ariakit.Button>
                          }
                        />
                        <Ariakit.HovercardDisclosure
                          className="rounded-full text-text-secondary focus:outline-none focus:ring-2 focus:ring-ring"
                          aria-label={localize('com_ui_tool_more_info')}
                          aria-expanded={hoveredToolId === subTool.tool_id}
                          aria-controls={`tool-description-${subTool.tool_id}`}
                        >
                          <Ariakit.VisuallyHidden>
                            {localize('com_ui_tool_more_info')}
                          </Ariakit.VisuallyHidden>
                          <ChevronDown className="h-4 w-4" />
                        </Ariakit.HovercardDisclosure>
                      </div>
                      <Ariakit.Hovercard
                        id={`tool-description-${subTool.tool_id}`}
                        gutter={14}
                        shift={40}
                        flip={false}
                        className="z-[999] w-80 scale-95 rounded-2xl border border-border-medium bg-surface-secondary p-4 text-text-primary opacity-0 shadow-md transition-all duration-200 data-[enter]:scale-100 data-[leave]:scale-95 data-[enter]:opacity-100 data-[leave]:opacity-0"
                        portal={true}
                        unmountOnHide={true}
                        role="tooltip"
                        aria-label={subTool.metadata.description}
                      >
                        <div className="space-y-2">
                          <p className="text-sm text-text-secondary">
                            {subTool.metadata.description}
                          </p>
                        </div>
                      </Ariakit.Hovercard>
                    </Ariakit.HovercardProvider>
                  )}
                </label>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <OGDialogTemplate
        showCloseButton={false}
        title={localize('com_ui_delete_tool')}
        mainClassName="px-0"
        className="max-w-[450px]"
        main={
          <Label className="text-left text-sm font-medium">
            {localize('com_ui_delete_tool_confirm')}
          </Label>
        }
        selection={{
          selectHandler: () => removeTool(currentTool.tool_id),
          selectClasses:
            'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 transition-color duration-200 text-white',
          selectText: localize('com_ui_delete'),
        }}
      />
    </OGDialog>
  );
}
