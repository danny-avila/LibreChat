import React, { useState, useCallback } from 'react';
import { ChevronDown, Clock } from 'lucide-react';
import { Constants } from 'librechat-data-provider';
import { useFormContext, useWatch } from 'react-hook-form';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import {
  Label,
  ESide,
  Checkbox,
  OGDialog,
  Accordion,
  TrashIcon,
  TooltipAnchor,
  InfoHoverCard,
  AccordionItem,
  OGDialogTrigger,
  AccordionContent,
  OGDialogTemplate,
} from '@librechat/client';
import type { AgentToolOptions } from 'librechat-data-provider';
import type { AgentForm, MCPServerInfo } from '~/common';
import {
  useAgentCapabilities,
  useMCPServerManager,
  useGetAgentsConfig,
  useRemoveMCPTool,
  useLocalize,
} from '~/hooks';
import MCPServerStatusIcon from '~/components/MCP/MCPServerStatusIcon';
import { renderMCPIcon } from '~/components/MCP/renderMCPIcon';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import { cn } from '~/utils';

export default function MCPTool({ serverInfo }: { serverInfo?: MCPServerInfo }) {
  const localize = useLocalize();
  const { removeTool } = useRemoveMCPTool();
  const { getValues, setValue, control } = useFormContext<AgentForm>();
  const { getServerStatusIconProps, getConfigDialogProps } = useMCPServerManager();
  const { agentsConfig } = useGetAgentsConfig();
  const { deferredToolsEnabled } = useAgentCapabilities(agentsConfig?.capabilities);

  const [isFocused, setIsFocused] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [accordionValue, setAccordionValue] = useState<string>('');

  const formToolOptions = useWatch({ control, name: 'tool_options' });

  /** Check if a specific tool has defer_loading enabled */
  const isToolDeferred = useCallback(
    (toolId: string): boolean => formToolOptions?.[toolId]?.defer_loading === true,
    [formToolOptions],
  );

  /** Toggle defer_loading for a specific tool */
  const toggleToolDefer = useCallback(
    (toolId: string) => {
      const currentOptions = getValues('tool_options') || {};
      const currentToolOptions = currentOptions[toolId] || {};
      const newDeferred = !currentToolOptions.defer_loading;

      const updatedOptions: AgentToolOptions = { ...currentOptions };

      if (newDeferred) {
        updatedOptions[toolId] = {
          ...currentToolOptions,
          defer_loading: true,
        };
      } else {
        const { defer_loading: _, ...restOptions } = currentToolOptions;
        if (Object.keys(restOptions).length === 0) {
          delete updatedOptions[toolId];
        } else {
          updatedOptions[toolId] = restOptions;
        }
      }

      setValue('tool_options', updatedOptions, { shouldDirty: true });
    },
    [getValues, setValue],
  );

  /** Check if all server tools are deferred */
  const areAllToolsDeferred =
    serverInfo?.tools &&
    serverInfo.tools.length > 0 &&
    serverInfo.tools.every((tool) => formToolOptions?.[tool.tool_id]?.defer_loading === true);

  /** Toggle defer_loading for all tools from this server */
  const toggleDeferAll = useCallback(() => {
    if (!serverInfo?.tools) return;

    const shouldDefer = !areAllToolsDeferred;
    const currentOptions = getValues('tool_options') || {};
    const updatedOptions: AgentToolOptions = { ...currentOptions };

    for (const tool of serverInfo.tools) {
      if (shouldDefer) {
        updatedOptions[tool.tool_id] = {
          ...(updatedOptions[tool.tool_id] || {}),
          defer_loading: true,
        };
      } else {
        if (updatedOptions[tool.tool_id]) {
          delete updatedOptions[tool.tool_id].defer_loading;
          if (Object.keys(updatedOptions[tool.tool_id]).length === 0) {
            delete updatedOptions[tool.tool_id];
          }
        }
      }
    }

    setValue('tool_options', updatedOptions, { shouldDirty: true });
  }, [serverInfo?.tools, getValues, setValue, areAllToolsDeferred]);

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

                <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                  {renderMCPIcon({
                    iconPath: serverInfo.metadata.icon,
                    serverName: currentServerName,
                    displayName: currentServerName,
                    className: 'h-6 w-6 rounded-full object-cover',
                    wrapDefault: true,
                  })}
                </div>
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

                        {/* Defer All toggle - icon only with tooltip */}
                        {deferredToolsEnabled && (
                          <TooltipAnchor
                            description={
                              areAllToolsDeferred
                                ? localize('com_ui_mcp_undefer_all')
                                : localize('com_ui_mcp_defer_all')
                            }
                            side="top"
                            role="button"
                            tabIndex={isExpanded ? 0 : -1}
                            aria-label={
                              areAllToolsDeferred
                                ? localize('com_ui_mcp_undefer_all')
                                : localize('com_ui_mcp_defer_all')
                            }
                            aria-pressed={areAllToolsDeferred}
                            className={cn(
                              'flex h-7 w-7 items-center justify-center rounded transition-colors duration-200',
                              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                              isExpanded ? 'visible' : 'pointer-events-none invisible',
                              areAllToolsDeferred
                                ? 'bg-amber-500/20 text-amber-500 hover:bg-amber-500/30'
                                : 'text-text-tertiary hover:bg-surface-hover hover:text-text-primary',
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDeferAll();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleDeferAll();
                              }
                            }}
                          >
                            <Clock
                              className={cn('h-4 w-4', areAllToolsDeferred && 'fill-amber-500/30')}
                            />
                          </TooltipAnchor>
                        )}

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
              {serverInfo.tools?.map((subTool) => {
                const isDeferred = deferredToolsEnabled && isToolDeferred(subTool.tool_id);
                return (
                  <label
                    key={subTool.tool_id}
                    htmlFor={subTool.tool_id}
                    className={cn(
                      'group/item flex cursor-pointer items-center rounded-lg border p-2',
                      'ml-2 mr-1 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
                      isDeferred
                        ? 'border-amber-500/50 bg-amber-500/5 hover:bg-amber-500/10'
                        : 'border-token-border-light hover:bg-token-surface-secondary',
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
                    <span className="text-token-text-primary flex-1 select-none">
                      {subTool.metadata.name}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      {/* Per-tool defer toggle - icon only */}
                      {deferredToolsEnabled && (
                        <TooltipAnchor
                          description={
                            isDeferred
                              ? localize('com_ui_mcp_click_to_undefer')
                              : localize('com_ui_mcp_click_to_defer')
                          }
                          side="top"
                          role="button"
                          aria-label={
                            isDeferred
                              ? localize('com_ui_mcp_undefer')
                              : localize('com_ui_mcp_defer_loading')
                          }
                          aria-pressed={isDeferred}
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded transition-all duration-200',
                            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                            isDeferred
                              ? 'bg-amber-500/20 text-amber-500 hover:bg-amber-500/30'
                              : 'text-text-tertiary opacity-0 hover:bg-surface-hover hover:text-text-primary group-focus-within/item:opacity-100 group-hover/item:opacity-100',
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            toggleToolDefer(subTool.tool_id);
                          }}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleToolDefer(subTool.tool_id);
                            }
                          }}
                        >
                          <Clock className={cn('h-3.5 w-3.5', isDeferred && 'fill-amber-500/30')} />
                        </TooltipAnchor>
                      )}
                      {subTool.metadata.description && (
                        <InfoHoverCard side={ESide.Left} text={subTool.metadata.description} />
                      )}
                    </div>
                  </label>
                );
              })}
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
