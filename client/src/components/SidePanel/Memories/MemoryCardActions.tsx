import { useState, useRef } from 'react';
import { Pencil } from 'lucide-react';
import { Trans } from 'react-i18next';
import {
  Label,
  Spinner,
  OGDialog,
  TrashIcon,
  TooltipAnchor,
  OGDialogTrigger,
  OGDialogTemplate,
  useToastContext,
} from '@librechat/client';
import type { TUserMemory } from 'librechat-data-provider';
import { useDeleteMemoryMutation } from '~/data-provider';
import MemoryEditDialog from './MemoryEditDialog';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface MemoryCardActionsProps {
  memory: TUserMemory;
}

export default function MemoryCardActions({ memory }: MemoryCardActionsProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { mutate: deleteMemory, isLoading: isDeleting } = useDeleteMemoryMutation();

  const buttonBaseClass = cn(
    'flex size-7 items-center justify-center rounded-md',
    'transition-colors duration-150',
    'text-text-secondary hover:text-text-primary',
    'hover:bg-surface-tertiary',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy',
  );

  const confirmDelete = () => {
    deleteMemory(memory.key, {
      onSuccess: () => {
        showToast({ message: localize('com_ui_deleted'), status: 'success' });
        setDeleteOpen(false);
      },
      onError: () => {
        showToast({ message: localize('com_ui_error'), status: 'error' });
      },
    });
  };

  return (
    <div className="flex items-center gap-0.5">
      {/* Edit Button */}
      <MemoryEditDialog
        open={editOpen}
        memory={memory}
        onOpenChange={setEditOpen}
        triggerRef={triggerRef as React.MutableRefObject<HTMLButtonElement | null>}
      >
        <OGDialogTrigger asChild>
          <TooltipAnchor
            description={localize('com_ui_edit_memory')}
            side="top"
            render={
              <button
                ref={triggerRef}
                className={buttonBaseClass}
                aria-label={localize('com_ui_edit')}
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
              </button>
            }
          />
        </OGDialogTrigger>
      </MemoryEditDialog>

      {/* Delete Button */}
      <OGDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <OGDialogTrigger asChild>
          <TooltipAnchor
            description={localize('com_ui_delete_memory')}
            side="top"
            render={
              <button
                className={buttonBaseClass}
                aria-label={localize('com_ui_delete')}
                onClick={() => setDeleteOpen(true)}
              >
                {isDeleting ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <TrashIcon className="size-3.5" aria-hidden="true" />
                )}
              </button>
            }
          />
        </OGDialogTrigger>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_ui_delete_memory')}
          className="w-11/12 max-w-lg"
          main={
            <Label className="text-left text-sm font-medium">
              <Trans
                i18nKey="com_ui_delete_confirm_strong"
                values={{ title: memory.key }}
                components={{ strong: <strong /> }}
              />
            </Label>
          }
          selection={{
            selectHandler: confirmDelete,
            selectClasses:
              'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
            selectText: localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    </div>
  );
}
