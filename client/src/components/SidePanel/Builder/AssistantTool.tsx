import type { TPlugin } from 'librechat-data-provider';
import { GearIcon } from '~/components/svg';
import { cn } from '~/utils';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';
import { useState } from 'react';
import { Dialog, DialogTrigger, Label } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { useLocalize } from '~/hooks';
import { useToastContext } from '~/Providers';
import { useFormContext } from 'react-hook-form';

export default function AssistantTool({
  tool,
  allTools,
  assistant_id,
}: {
  tool: string;
  allTools: TPlugin[];
  assistant_id?: string;
}) {
  const currentTool = allTools.find((t) => t.pluginKey === tool);
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const updateUserPlugins = useUpdateUserPluginsMutation();
  const { getValues, setValue } = useFormContext();
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);

  const removeTool = (tool: string) => {
    if (tool) {
      updateUserPlugins.mutate(
        { pluginKey: tool, action: 'uninstall', auth: null, isAssistantTool: true },
        {
          onError: (error: unknown) => {
            showToast({ message: `Error while deleting the tool: ${error}`, status: 'error' });
          },
          onSuccess: () => {
            const fns = getValues('functions').filter((fn) => fn !== tool);
            setValue('functions', fns);
            showToast({ message: 'Tool deleted successfully', status: 'success' });
          },
        },
      );
    }
  };

  if (!currentTool) {
    return null;
  }

  return (
    <div>
      <div
        className={cn(
          'border-token-border-medium flex w-full rounded-lg border text-sm hover:cursor-pointer',
          !assistant_id ? 'opacity-40' : '',
        )}
      >
        {currentTool.icon && (
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full">
            <div
              className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-center bg-no-repeat dark:bg-white/20"
              style={{ backgroundImage: `url(${currentTool.icon})`, backgroundSize: 'cover' }}
            />
          </div>
        )}
        <div
          className="h-9 grow px-3 py-2"
          style={{ textOverflow: 'ellipsis', wordBreak: 'break-all', overflow: 'hidden' }}
        >
          {currentTool.name}
        </div>
        <div className="w-px bg-gray-300 dark:bg-gray-600" />

        <Dialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="flex h-9 w-9 min-w-9 items-center justify-center rounded-lg rounded-l-none"
            >
              <GearIcon className="icon-sm" />
            </button>
          </DialogTrigger>
          <DialogTemplate
            showCloseButton={false}
            title={localize('com_ui_delete_tool')}
            className="max-w-[450px]"
            main={
              <>
                <div className="flex w-full flex-col items-center gap-2">
                  <div className="grid w-full items-center gap-2">
                    <Label className="text-left text-sm font-medium">
                      {localize('com_ui_delete_tool_confirm')}
                    </Label>
                  </div>
                </div>
              </>
            }
            selection={{
              selectHandler: () => removeTool(currentTool.pluginKey),
              selectClasses:
                'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
              selectText: localize('com_ui_delete'),
            }}
          />
        </Dialog>
      </div>
    </div>
  );
}
