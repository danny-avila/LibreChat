import React, { useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronDown } from 'lucide-react';
import { VisuallyHidden } from '@ariakit/react';
import { useFormContext } from 'react-hook-form';
import type { AgentToolType } from 'librechat-data-provider';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import { OGDialog, OGDialogTrigger, Label, Checkbox } from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import CircleHelpIcon from '~/components/svg/CircleHelpIcon';
import { useToastContext } from '~/Providers';
import { TrashIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function AgentTool({
  tool,
  allTools,
}: {
  tool: string;
  allTools: Record<string, AgentToolType & { tools?: AgentToolType[] }>;
  agent_id?: string;
}) {
  const [isHovering, setIsHovering] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hoveredToolId, setHoveredToolId] = useState<string | null>(null);
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const updateUserPlugins = useUpdateUserPluginsMutation();
  const { getValues, setValue } = useFormContext();
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

  const removeTool = (tool: string) => {
    if (tool) {
      const toolsToRemove =
        isGroup && currentTool.tools ? [tool, ...currentTool.tools.map((t) => t.tool_id)] : [tool];

      updateUserPlugins.mutate(
        { pluginKey: tool, action: 'uninstall', auth: {}, isEntityTool: true },
        {
          onError: (error: unknown) => {
            showToast({ message: `Error while deleting the tool: ${error}`, status: 'error' });
          },
          onSuccess: () => {
            const tools = getValues('tools').filter((fn: string) => !toolsToRemove.includes(fn));
            setValue('tools', tools);
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

  return (
    <OGDialog>
      <div
        className="flex w-full items-center rounded-lg text-sm"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div
          className="flex grow cursor-pointer items-center"
          onClick={(e) => {
            if (isGroup && !(e.target as HTMLElement).closest('input[type="checkbox"], label')) {
              setIsExpanded(!isExpanded);
            }
          }}
        >
          {currentTool.metadata.icon && (
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full">
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
            className="h-9 grow px-3 py-2"
            style={{ textOverflow: 'ellipsis', wordBreak: 'break-all', overflow: 'hidden' }}
          >
            {currentTool.metadata.name}
          </div>
          {isGroup && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                <div
                  className={cn(
                    'mr-2 mt-0.5 flex overflow-hidden transition-all duration-200',
                    isExpanded ? 'w-4 opacity-100' : 'w-0 opacity-0',
                    isHovering ? '-translate-x-9' : 'translate-x-0',
                  )}
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
                    className="relative inline-flex h-4 w-4 cursor-pointer rounded border border-gray-300 transition-[border-color] duration-200 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="relative flex items-center">
                  <div
                    className={cn(
                      'mt-0.5 flex h-4 w-4 items-center justify-center transition-all duration-200',
                      isExpanded ? 'rotate-180' : '',
                      isHovering ? '-translate-x-9' : 'translate-x-0',
                    )}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </div>
                  <div
                    className={cn(
                      'absolute right-0 flex items-center transition-all duration-200',
                      isHovering ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0',
                    )}
                  >
                    <OGDialogTrigger asChild>
                      <button
                        type="button"
                        className="flex h-9 w-9 min-w-9 items-center justify-center rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </OGDialogTrigger>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {isHovering && !isGroup && (
          <OGDialogTrigger asChild>
            <button
              type="button"
              className="transition-color flex h-9 w-9 min-w-9 items-center justify-center rounded-lg duration-200 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              <TrashIcon />
            </button>
          </OGDialogTrigger>
        )}
      </div>
      {isGroup && (
        <div
          className={cn(
            'ml-4 space-y-1 border-l-2 border-border-medium pl-4 transition-all duration-300 ease-in-out',
            isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 overflow-hidden opacity-0',
          )}
        >
          {currentTool.tools?.map((subTool) => (
            <label
              key={subTool.tool_id}
              htmlFor={subTool.tool_id}
              className="border-token-border-light hover:bg-token-surface-secondary flex cursor-pointer items-center rounded-lg border p-2"
              onClick={(e) => e.stopPropagation()}
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
                className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer rounded border border-gray-300 transition-[border-color] duration-200 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500"
              />
              {/* {subTool.metadata.icon && (
                <div className="mr-2 flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
                  <img
                    src={subTool.metadata.icon}
                    alt={subTool.metadata.name}
                    className="h-4 w-4 object-contain"
                  />
                </div>
              )} */}
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
                          <VisuallyHidden>{localize('com_ui_tool_info')}</VisuallyHidden>
                        </Ariakit.Button>
                      }
                    />
                    <Ariakit.HovercardDisclosure
                      className="rounded-full text-text-secondary focus:outline-none focus:ring-2 focus:ring-ring"
                      aria-label={localize('com_ui_tool_more_info')}
                      aria-expanded={hoveredToolId === subTool.tool_id}
                      aria-controls={`tool-description-${subTool.tool_id}`}
                    >
                      <VisuallyHidden>{localize('com_ui_tool_more_info')}</VisuallyHidden>
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
                      <p className="text-sm text-text-secondary">{subTool.metadata.description}</p>
                    </div>
                  </Ariakit.Hovercard>
                </Ariakit.HovercardProvider>
              )}
            </label>
          ))}
        </div>
      )}
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
