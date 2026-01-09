import { useState, useRef } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  Label,
  Button,
  Spinner,
  OGDialog,
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

  const handleDelete = () => {
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
            description={localize('com_ui_edit')}
            side="top"
            render={
              <Button
                ref={triggerRef}
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={localize('com_ui_edit')}
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="size-4" aria-hidden="true" />
              </Button>
            }
          />
        </OGDialogTrigger>
      </MemoryEditDialog>

      <OGDialog open={deleteOpen} onOpenChange={setDeleteOpen} triggerRef={triggerRef}>
        <OGDialogTrigger asChild>
          <TooltipAnchor
            description={localize('com_ui_delete')}
            side="top"
            render={
              <Button
                ref={triggerRef}
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
    </div>
  );
}
