import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  OGDialog,
  OGDialogTrigger,
  OGDialogTemplate,
  Label,
  Button,
  Spinner,
  TooltipAnchor,
  useToastContext,
} from '@librechat/client';
import type { TUserMemory } from 'librechat-data-provider';
import { useDeleteMemoryMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

interface MemoryEditDialogProps {
  memory: TUserMemory | null;
}

export default function MemoryDeleteDialog({ memory }: MemoryEditDialogProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { mutate: deleteMemory, isLoading: isDeleting } = useDeleteMemoryMutation();

  const [deleteOpen, setDeleteOpen] = useState(false);

  if (memory === null) {
    return null;
  }

  const handleDelete = () => {
    deleteMemory(memory.key, {
      onSuccess: () => {
        showToast({ message: localize('com_ui_memory_deleted_success'), status: 'success' });
        setDeleteOpen(false);
      },
      onError: () => {
        showToast({ message: localize('com_ui_memory_delete_error'), status: 'error' });
      },
    });
  };

  return (
    <OGDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <OGDialogTrigger asChild>
        <TooltipAnchor
          description={localize('com_ui_delete')}
          side="top"
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={localize('com_ui_delete')}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          }
        />
      </OGDialogTrigger>
      <OGDialogTemplate
        title={localize('com_ui_delete_memory')}
        className="w-11/12 max-w-md"
        main={<Label>{localize('com_ui_memory_delete_confirm', { 0: memory.key })}</Label>}
        selection={
          <Button onClick={handleDelete} variant="destructive">
            {isDeleting ? <Spinner /> : localize('com_ui_delete')}
          </Button>
        }
      />
    </OGDialog>
  );
}
