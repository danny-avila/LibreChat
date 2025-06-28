import React, { useState } from 'react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { OGDialog, OGDialogTemplate, Button, Label, Input } from '~/components/ui';
import { useCreateMemoryMutation } from '~/data-provider';
import { useLocalize, useHasAccess } from '~/hooks';
import { useToastContext } from '~/Providers';
import { Spinner } from '~/components/svg';

interface MemoryCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  triggerRef?: React.MutableRefObject<HTMLButtonElement | null>;
}

export default function MemoryCreateDialog({
  open,
  onOpenChange,
  children,
  triggerRef,
}: MemoryCreateDialogProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.CREATE,
  });

  const { mutate: createMemory, isLoading } = useCreateMemoryMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_memory_created'),
        status: 'success',
      });
      onOpenChange(false);
      setKey('');
      setValue('');
      setTimeout(() => {
        triggerRef?.current?.focus();
      }, 0);
    },
    onError: (error: Error) => {
      let errorMessage = localize('com_ui_error');

      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        if (axiosError.response?.data?.error) {
          errorMessage = axiosError.response.data.error;

          // Check for duplicate key error
          if (axiosError.response?.status === 409 || errorMessage.includes('already exists')) {
            errorMessage = localize('com_ui_memory_key_exists');
          }
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      showToast({
        message: errorMessage,
        status: 'error',
      });
    },
  });

  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  const handleSave = () => {
    if (!hasCreateAccess) {
      return;
    }

    if (!key.trim() || !value.trim()) {
      showToast({
        message: localize('com_ui_field_required'),
        status: 'error',
      });
      return;
    }

    createMemory({
      key: key.trim(),
      value: value.trim(),
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey && hasCreateAccess) {
      handleSave();
    }
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
      {children}
      <OGDialogTemplate
        title={localize('com_ui_create_memory')}
        showCloseButton={false}
        className="w-11/12 md:max-w-lg"
        main={
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="memory-key" className="text-sm font-medium">
                {localize('com_ui_key')}
              </Label>
              <Input
                id="memory-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={localize('com_ui_enter_key')}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="memory-value" className="text-sm font-medium">
                {localize('com_ui_value')}
              </Label>
              <textarea
                id="memory-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={localize('com_ui_enter_value')}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                rows={3}
              />
            </div>
          </div>
        }
        buttons={
          <Button
            type="button"
            variant="submit"
            onClick={handleSave}
            disabled={isLoading || !key.trim() || !value.trim()}
            className="text-white"
          >
            {isLoading ? <Spinner className="size-4" /> : localize('com_ui_create')}
          </Button>
        }
      />
    </OGDialog>
  );
}
