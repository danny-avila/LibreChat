import React, { useState, useEffect } from 'react';
import type { TUserMemory } from 'librechat-data-provider';
import { OGDialog, OGDialogTemplate, Button, Label, Input } from '~/components/ui';
import { useUpdateMemoryMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';
import { Spinner } from '~/components/svg';
import { useLocalize } from '~/hooks';

interface MemoryEditDialogProps {
  memory: TUserMemory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export default function MemoryEditDialog({
  memory,
  open,
  onOpenChange,
  children,
}: MemoryEditDialogProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { mutate: updateMemory, isLoading } = useUpdateMemoryMutation();

  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [originalKey, setOriginalKey] = useState('');

  useEffect(() => {
    if (memory) {
      setKey(memory.key);
      setValue(memory.value);
      setOriginalKey(memory.key);
    }
  }, [memory]);

  const handleSave = () => {
    if (!key.trim() || !value.trim()) {
      showToast({
        message: localize('com_ui_field_required'),
        status: 'error',
      });
      return;
    }

    updateMemory(
      {
        key: key.trim(),
        value: value.trim(),
        ...(originalKey !== key.trim() && { originalKey }),
      },
      {
        onSuccess: () => {
          showToast({
            message: localize('com_ui_saved'),
            status: 'success',
          });
          onOpenChange(false);
        },
        onError: () => {
          showToast({
            message: localize('com_ui_error'),
            status: 'error',
          });
        },
      },
    );
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSave();
    }
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      {children}
      <OGDialogTemplate
        title={localize('com_ui_edit_memory')}
        showCloseButton={false}
        className="w-11/12 md:max-w-lg"
        main={
          <div className="space-y-4">
            {memory && (
              <div className="text-xs text-text-secondary">
                {localize('com_ui_date')}:{' '}
                {new Date(memory.updated_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            )}
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
            variant="submit"
            onClick={handleSave}
            disabled={isLoading || !key.trim() || !value.trim()}
            className="text-white"
          >
            {isLoading ? <Spinner className="size-4" /> : localize('com_ui_save')}
          </Button>
        }
      />
    </OGDialog>
  );
}
