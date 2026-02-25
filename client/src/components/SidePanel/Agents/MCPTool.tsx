import React, { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Constants } from 'librechat-data-provider';
import { ChevronDown, Clock, Code2 } from 'lucide-react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import {
  Label,
  Checkbox,
  OGDialog,
  Accordion,
  TrashIcon,
  TooltipAnchor,
  AccordionItem,
  OGDialogTrigger,
  AccordionContent,
  OGDialogTemplate,
} from '@librechat/client';
import type { AgentForm, MCPServerInfo } from '~/common';
import {
  useAgentCapabilities,
  useMCPServerManager,
  useGetAgentsConfig,
  useMCPToolOptions,
  useRemoveMCPTool,
  useLocalize,
} from '~/hooks';
import MCPServerStatusIcon from '~/components/MCP/MCPServerStatusIcon';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import MCPToolItem from './MCPToolItem';
import { cn } from '~/utils';

export default function MCPTool({ serverInfo }: { serverInfo?: MCPServerInfo }) {
  const localize = useLocalize();
  const { removeTool } = useRemoveMCPTool();
  const { getValues, setValue } = useFormContext<AgentForm>();
  const { getServerStatusIconProps, getConfigDialogProps } = useMCPServerManager();
  const { agentsConfig } = useGetAgentsConfig();
  const { deferredToolsEnabled, programmaticToolsEnabled } = useAgentCapabilities(
    agentsConfig?.capabilities,
  );

  const {
    isToolDeferred,
    isToolProgrammatic,
    toggleToolDefer,
    toggleToolProgrammatic,
    areAllToolsDeferred,
    areAllToolsProgrammatic,
    toggleDeferAll,
    toggleProgrammaticAll,
  } = useMCPToolOptions();

  const [isFocused, setIsFocused] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [accordionValue, setAccordionValue] = useState<string>('');

  if (!serverInfo) {
    return null;
  }

  const currentServerName = serverInfo.serverName;
  const tools = serverInfo.tools || [];

  const getSelectedTools = () => {
    const formTools = getValues('tools') || [];
    return tools.filter((t) => formTools.includes(t.tool_id)).map((t) => t.tool_id);
  };

  const updateFormTools = (newSelectedTools: string[]) => {
    const currentTools = getValues('tools') || [];
    const otherTools = currentTools.filter((t: string) => !tools.some((st) => st.tool_id === t));
    setValue('tools', [...otherTools, ...newSelectedTools]);
  };

  const toggleToolSelect = (toolId: string) => {
    const selectedTools = getSelectedTools();
    const newSelectedTools = selectedTools.includes(toolId)
      ? selectedTools.filter((t) => t !== toolId)
      : [...selectedTools, toolId];
    updateFormTools(newSelectedTools);
  };

  const selectedTools = getSelectedTools();
  const isExpanded = accordionValue === currentServerName;
  const allDeferred = areAllToolsDeferred(tools);
  const allProgrammatic = areAllToolsProgrammatic(tools);

  const statusIconProps = getServerStatusIconProps(currentServerName);
  const configDialogProps = getConfigDialogProps();

  const statusIcon = statusIconProps && (
    <div
      onClick={(e) => e.stopPropagation()}
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
                onClick={() => setAccordionValue((prev) => (prev ? '' : currentServerName))}
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
                              selectedTools.length === tools.length && selectedTools.length > 0
                            }
                            onCheckedChange={(checked) => {
                              const newSelectedTools = checked
                                ? tools.map((t) => t.tool_id)
                                : [
                                    `${Constants.mcp_server}${Constants.mcp_delimiter}${currentServerName}`,
                                  ];
                              updateFormTools(newSelectedTools);
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
                              selectedTools.length === tools.length && selectedTools.length > 0
                                ? localize('com_ui_deselect_all')
                                : localize('com_ui_select_all')
                            }
                          />
                        </div>

                        {deferredToolsEnabled && (
                          <TooltipAnchor
                            description={
                              allDeferred
                                ? localize('com_ui_mcp_undefer_all')
                                : localize('com_ui_mcp_defer_all')
                            }
                            side="top"
                            role="button"
                            tabIndex={isExpanded ? 0 : -1}
                            aria-label={
                              allDeferred
                                ? localize('com_ui_mcp_undefer_all')
                                : localize('com_ui_mcp_defer_all')
                            }
                            aria-pressed={allDeferred}
                            className={cn(
                              'flex h-7 w-7 items-center justify-center rounded transition-colors duration-200',
                              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                              isExpanded ? 'visible' : 'pointer-events-none invisible',
                              allDeferred
                                ? 'bg-amber-500/20 text-amber-500 hover:bg-amber-500/30'
                                : 'text-text-tertiary hover:bg-surface-hover hover:text-text-primary',
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDeferAll(tools);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleDeferAll(tools);
                              }
                            }}
                          >
                            <Clock className={cn('h-4 w-4', allDeferred && 'fill-amber-500/30')} />
                          </TooltipAnchor>
                        )}

                        {programmaticToolsEnabled && (
                          <TooltipAnchor
                            description={
                              allProgrammatic
                                ? localize('com_ui_mcp_unprogrammatic_all')
                                : localize('com_ui_mcp_programmatic_all')
                            }
                            side="top"
                            role="button"
                            tabIndex={isExpanded ? 0 : -1}
                            aria-label={
                              allProgrammatic
                                ? localize('com_ui_mcp_unprogrammatic_all')
                                : localize('com_ui_mcp_programmatic_all')
                            }
                            aria-pressed={allProgrammatic}
                            className={cn(
                              'flex h-7 w-7 items-center justify-center rounded transition-colors duration-200',
                              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                              isExpanded ? 'visible' : 'pointer-events-none invisible',
                              allProgrammatic
                                ? 'bg-violet-500/20 text-violet-500 hover:bg-violet-500/30'
                                : 'text-text-tertiary hover:bg-surface-hover hover:text-text-primary',
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleProgrammaticAll(tools);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleProgrammaticAll(tools);
                              }
                            }}
                          >
                            <Code2
                              className={cn('h-4 w-4', allProgrammatic && 'fill-violet-500/30')}
                            />
                          </TooltipAnchor>
                        )}

                        <div className="flex items-center gap-1">
                          <AccordionPrimitive.Trigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
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
                              className="flex h-7 w-7 items-center justify-center rounded transition-colors duration-200 hover:bg-surface-active-alt focus:translate-x-0 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
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
              {tools.map((tool) => (
                <MCPToolItem
                  key={tool.tool_id}
                  tool={tool}
                  isSelected={selectedTools.includes(tool.tool_id)}
                  isDeferred={deferredToolsEnabled && isToolDeferred(tool.tool_id)}
                  isProgrammatic={programmaticToolsEnabled && isToolProgrammatic(tool.tool_id)}
                  deferredToolsEnabled={deferredToolsEnabled}
                  programmaticToolsEnabled={programmaticToolsEnabled}
                  onToggleSelect={() => toggleToolSelect(tool.tool_id)}
                  onToggleDefer={() => toggleToolDefer(tool.tool_id)}
                  onToggleProgrammatic={() => toggleToolProgrammatic(tool.tool_id)}
                />
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
