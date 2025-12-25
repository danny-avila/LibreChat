import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { Constants } from 'librechat-data-provider';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import {
  Label,
  ESide,
  Checkbox,
  OGDialog,
  Accordion,
  TrashIcon,
  InfoHoverCard,
  AccordionItem,
  OGDialogTrigger,
  AccordionContent,
  OGDialogTemplate,
} from '@librechat/client';
import type { AgentForm, MCPServerInfo } from '~/common';
import { useLocalize, useMCPServerManager, useRemoveMCPTool } from '~/hooks';
import MCPServerStatusIcon from '~/components/MCP/MCPServerStatusIcon';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import { cn } from '~/utils';

export default function MCPTool({ serverInfo }: { serverInfo?: MCPServerInfo }) {
  const localize = useLocalize();
  const { removeTool } = useRemoveMCPTool();
  const { getValues, setValue } = useFormContext<AgentForm>();
  const { getServerStatusIconProps, getConfigDialogProps } = useMCPServerManager();

  const [isFocused, setIsFocused] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [accordionValue, setAccordionValue] = useState<string>('');

  if (!serverInfo) {
    return null;
  }

  const currentServerName = serverInfo.serverName;

  const getSelectedTools = () => {
    if (!serverInfo?.tools) return [];
    const formTools = getValues('tools') || [];
    return serverInfo.tools.filter((t) => formTools.includes(t.tool_id)).map((t) => t.tool_id);
  };

  const updateFormTools = (newSelectedTools: string[]) => {
    const currentTools = getValues('tools') || [];
    const otherTools = currentTools.filter(
      (t: string) => !serverInfo?.tools?.some((st) => st.tool_id === t),
    );
    setValue('tools', [...otherTools, ...newSelectedTools]);
  };

  const selectedTools = getSelectedTools();
  const isExpanded = accordionValue === currentServerName;

  const statusIconProps = getServerStatusIconProps(currentServerName);
  const configDialogProps = getConfigDialogProps();

  const statusIcon = statusIconProps && (
    <div
      onClick={(e) => {
        e.stopPropagation();
      }}
      className="cursor-pointer rounded p-0.5 hover:bg-surface-secondary"
    >
      <MCPServerStatusIcon {...statusIconProps} />
    </div>
  );

  return (
    <OGDialog>
      <Accordion type="single" value={accordionValue} onValueChange={setAccordionValue} collapsible>
        <AccordionItem value={currentServerName} className="group relative w-full border-none">
          <div
            className="relative flex w-full items-center gap-1 rounded-lg p-1 hover:bg-surface-primary-alt"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            onFocus={() => setIsFocused(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) {
                setIsFocused(false);
              }
            }}
          >
            <AccordionPrimitive.Header asChild>
              <div
                className="flex grow cursor-pointer select-none items-center gap-1 rounded bg-transparent p-0 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                onClick={() =>
                  setAccordionValue((prev) => {
                    if (prev) {
                      return '';
                    }
                    return currentServerName;
                  })
                }
              >
                {statusIcon && <div className="flex items-center">{statusIcon}</div>}

                {serverInfo.metadata.icon && (
                  <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full">
                    <div
                      className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-center bg-no-repeat dark:bg-white/20"
                      style={{
                        backgroundImage: `url(${serverInfo.metadata.icon})`,
                        backgroundSize: 'cover',
                      }}
                    />
                  </div>
                )}
                <div
                  className="grow px-2 py-1.5"
                  style={{ textOverflow: 'ellipsis', wordBreak: 'break-all', overflow: 'hidden' }}
                >
                  {currentServerName}
                </div>
                <div className="flex items-center">
                  <div className="relative flex items-center">
                    <div
                      className={cn(
                        'absolute right-0 transition-all duration-300',
                        isHovering || isFocused
                          ? 'translate-x-0 opacity-100'
                          : 'translate-x-8 opacity-0',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          data-checkbox-container
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1"
                        >
                          <Checkbox
                            id={`select-all-${currentServerName}`}
                            checked={
                              selectedTools.length === serverInfo.tools?.length &&
                              selectedTools.length > 0
                            }
                            onCheckedChange={(checked) => {
                              if (serverInfo.tools) {
                                const newSelectedTools = checked
                                  ? serverInfo.tools.map((t) => t.tool_id)
                                  : [
                                      `${Constants.mcp_server}${Constants.mcp_delimiter}${currentServerName}`,
                                    ];
                                updateFormTools(newSelectedTools);
                              }
                            }}
                            className={cn(
                              'h-4 w-4 rounded border border-border-medium transition-all duration-200 hover:border-border-heavy',
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
                            aria-label={
                              selectedTools.length === serverInfo.tools?.length &&
                              selectedTools.length > 0
                                ? localize('com_ui_deselect_all')
                                : localize('com_ui_select_all')
                            }
                          />
                        </div>

                        <div className="flex items-center gap-1">
                          {/* Caret button for accordion */}
                          <AccordionPrimitive.Trigger asChild>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              className={cn(
                                'flex h-7 w-7 items-center justify-center rounded transition-colors duration-200 hover:bg-surface-active-alt focus:translate-x-0 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                                isExpanded && 'bg-surface-active-alt',
                              )}
                              aria-label={
                                isExpanded
                                  ? localize('com_ui_tool_list_collapse', {
                                      serverName: currentServerName,
                                    })
                                  : localize('com_ui_tool_list_expand', {
                                      serverName: currentServerName,
                                    })
                              }
                              aria-expanded={isExpanded}
                              tabIndex={0}
                              onFocus={() => setIsFocused(true)}
                            >
                              <ChevronDown
                                className={cn(
                                  'h-4 w-4 transition-transform duration-200',
                                  isExpanded && 'rotate-180',
                                )}
                              />
                            </button>
                          </AccordionPrimitive.Trigger>

                          <OGDialogTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                'flex h-7 w-7 items-center justify-center rounded transition-colors duration-200',
                                'hover:bg-surface-active-alt focus:translate-x-0 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                              )}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Delete ${currentServerName}`}
                              tabIndex={0}
                              onFocus={() => setIsFocused(true)}
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </OGDialogTrigger>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </AccordionPrimitive.Header>
          </div>

          <AccordionContent className="relative ml-1 pt-1 before:absolute before:bottom-2 before:left-0 before:top-0 before:w-0.5 before:bg-border-medium">
            <div className="space-y-1">
              {serverInfo.tools?.map((subTool) => (
                <label
                  key={subTool.tool_id}
                  htmlFor={subTool.tool_id}
                  className={cn(
                    'group/item border-token-border-light hover:bg-token-surface-secondary flex cursor-pointer items-center rounded-lg border p-2',
                    'ml-2 mr-1 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
                  )}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                  }}
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
                    className={cn(
                      'relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer rounded border border-border-medium transition-[border-color] duration-200 hover:border-border-heavy focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background',
                    )}
                    aria-label={subTool.metadata.name}
                  />
                  <span className="text-token-text-primary select-none">
                    {subTool.metadata.name}
                  </span>
                  {subTool.metadata.description && (
                    <div className="ml-auto flex items-center opacity-0 transition-opacity duration-200 group-focus-within/item:opacity-100 group-hover/item:opacity-100">
                      <InfoHoverCard side={ESide.Left} text={subTool.metadata.description} />
                    </div>
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
          selectHandler: () => removeTool(currentServerName),
          selectClasses:
            'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 transition-color duration-200 text-white',
          selectText: localize('com_ui_delete'),
        }}
      />
      {configDialogProps && <MCPConfigDialog {...configDialogProps} />}
    </OGDialog>
  );
}
