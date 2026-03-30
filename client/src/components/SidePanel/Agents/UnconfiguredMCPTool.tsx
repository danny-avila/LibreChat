import React, { useState } from 'react';
import { CircleX } from 'lucide-react';
import { Label, OGDialog, TrashIcon, OGDialogTrigger, OGDialogTemplate } from '@librechat/client';
import { useLocalize, useRemoveMCPTool } from '~/hooks';
import { cn } from '~/utils';

export default function UnconfiguredMCPTool({ serverName }: { serverName?: string }) {
  const localize = useLocalize();
  const { removeTool } = useRemoveMCPTool();

  const [isFocused, setIsFocused] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  if (!serverName) {
    return null;
  }

  return (
    <OGDialog>
      <div
        className="group relative flex w-full items-center gap-1 rounded-lg p-1 text-sm hover:bg-surface-primary-alt"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsFocused(false);
          }
        }}
      >
        <div className="flex items-center">
          <div className="flex h-6 w-6 items-center justify-center rounded p-1">
            <CircleX className="h-4 w-4 text-red-500" />
          </div>
        </div>

        <div className="flex grow cursor-not-allowed items-center gap-1 rounded bg-transparent p-0 text-left transition-colors">
          <div
            className="grow select-none px-2 py-1.5"
            style={{ textOverflow: 'ellipsis', wordBreak: 'break-all', overflow: 'hidden' }}
          >
            {serverName}
            <span className="ml-2 text-xs text-text-secondary">
              {' - '}
              {localize('com_ui_unavailable')}
            </span>
          </div>
        </div>

        <OGDialogTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded transition-all duration-200 hover:bg-surface-active-alt focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
              isHovering || isFocused ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            aria-label={`Delete ${serverName}`}
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
          selectHandler: () => removeTool(serverName || ''),
          selectClasses:
            'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 transition-color duration-200 text-white',
          selectText: localize('com_ui_delete'),
        }}
      />
    </OGDialog>
  );
}
