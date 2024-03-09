import * as Popover from '@radix-ui/react-popover';
import type { Assistant, AssistantCreateParams } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import { Dialog, DialogTrigger, Label } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { useDeleteAssistantMutation } from '~/data-provider';
import { useLocalize, useSetIndexOptions } from '~/hooks';
import { cn, removeFocusOutlines } from '~/utils/';
import { NewTrashIcon } from '~/components/svg';
import { useChatContext } from '~/Providers';

export default function ContextButton({
  assistant_id,
  setCurrentAssistantId,
  createMutation,
}: {
  assistant_id: string;
  setCurrentAssistantId: React.Dispatch<React.SetStateAction<string | undefined>>;
  createMutation: UseMutationResult<Assistant, Error, AssistantCreateParams>;
}) {
  const localize = useLocalize();
  const { conversation } = useChatContext();
  const { setOption } = useSetIndexOptions();

  const deleteAssistant = useDeleteAssistantMutation({
    onSuccess: (_, vars, context) => {
      const updatedList = context as Assistant[] | undefined;
      if (!updatedList) {
        return;
      }

      if (createMutation.data?.id) {
        console.log('[deleteAssistant] resetting createMutation');
        createMutation.reset();
      }

      const firstAssistant = updatedList[0] as Assistant | undefined;
      if (!firstAssistant) {
        return setOption('assistant_id')('');
      }

      if (vars.assistant_id === conversation?.assistant_id) {
        return setOption('assistant_id')(firstAssistant.id);
      }

      const currentAssistant = updatedList?.find(
        (assistant) => assistant.id === conversation?.assistant_id,
      );

      if (currentAssistant) {
        setCurrentAssistantId(currentAssistant.id);
      }

      setCurrentAssistantId(firstAssistant.id);
    },
  });

  if (!assistant_id) {
    return null;
  }

  return (
    <Dialog>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            className={cn(
              'btn border-token-border-light relative h-9 rounded-lg bg-transparent font-medium hover:bg-gray-100 dark:hover:bg-gray-800',
              removeFocusOutlines,
            )}
            type="button"
          >
            <div className="flex w-full items-center justify-center gap-2">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="icon-md"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M3 12C3 10.8954 3.89543 10 5 10C6.10457 10 7 10.8954 7 12C7 13.1046 6.10457 14 5 14C3.89543 14 3 13.1046 3 12ZM10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14C10.8954 14 10 13.1046 10 12ZM17 12C17 10.8954 17.8954 10 19 10C20.1046 10 21 10.8954 21 12C21 13.1046 20.1046 14 19 14C17.8954 14 17 13.1046 17 12Z"
                  fill="currentColor"
                />
              </svg>
            </div>
          </button>
        </Popover.Trigger>
        <div
          style={{
            position: 'fixed',
            left: ' 0px',
            top: ' 0px',
            transform: 'translate(1772.8px, 49.6px)',
            minWidth: 'max-content',
            zIndex: 'auto',
          }}
          dir="ltr"
        >
          <Popover.Content
            side="top"
            role="menu"
            className="bg-token-surface-primary min-w-[180px] max-w-xs rounded-lg border border-gray-100 bg-white shadow-lg dark:border-gray-900 dark:bg-gray-900"
            style={{ outline: 'none', pointerEvents: 'auto' }}
            sideOffset={8}
            tabIndex={-1}
            align="end"
          >
            <DialogTrigger asChild>
              <Popover.Close
                role="menuitem"
                className="group m-1.5 flex w-full cursor-pointer gap-2 rounded p-2.5 text-sm text-red-500 hover:bg-black/5 focus:ring-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 dark:hover:bg-white/5"
                tabIndex={-1}
              >
                <NewTrashIcon />
                {localize('com_ui_delete') + ' ' + localize('com_ui_assistant')}
              </Popover.Close>
            </DialogTrigger>
          </Popover.Content>
        </div>
        <DialogTemplate
          title={localize('com_ui_delete') + ' ' + localize('com_ui_assistant')}
          className="max-w-[450px]"
          main={
            <>
              <div className="flex w-full flex-col items-center gap-2">
                <div className="grid w-full items-center gap-2">
                  <Label htmlFor="delete-assistant" className="text-left text-sm font-medium">
                    {localize('com_ui_delete_assistant_confirm')}
                  </Label>
                </div>
              </div>
            </>
          }
          selection={{
            selectHandler: () => deleteAssistant.mutate({ assistant_id }),
            selectClasses: 'bg-red-600 hover:bg-red-700 dark:hover:bg-red-800 text-white',
            selectText: localize('com_ui_delete'),
          }}
        />
      </Popover.Root>
    </Dialog>
  );
}
