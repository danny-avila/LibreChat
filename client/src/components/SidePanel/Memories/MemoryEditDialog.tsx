import React, { useState, useEffect } from 'react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import {
  OGDialog,
  OGDialogTemplate,
  Button,
  Label,
  Input,
  Spinner,
  useToastContext,
} from '@librechat/client';
import type { TUserMemory } from 'librechat-data-provider';
import { useUpdateMemoryMutation, useMemoriesQuery } from '~/data-provider';
import { useLocalize, useHasAccess } from '~/hooks';

interface MemoryEditDialogProps {
  memory: TUserMemory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  triggerRef?: React.MutableRefObject<HTMLButtonElement | null>;
}

export default function MemoryEditDialog({
  memory,
  open,
  onOpenChange,
  children,
  triggerRef,
}: MemoryEditDialogProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: memData } = useMemoriesQuery();

  const hasUpdateAccess = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.UPDATE,
  });

  const { mutate: updateMemory, isLoading } = useUpdateMemoryMutation({
    onMutate: () => {
      onOpenChange(false);
      setTimeout(() => {
        triggerRef?.current?.focus();
      }, 0);
    },
    onSuccess: () => {
      showToast({
        message: localize('com_ui_saved'),
        status: 'success',
      });
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
          // Check for key validation error (lowercase and underscores only)
          else if (errorMessage.includes('lowercase letters and underscores')) {
            errorMessage = localize('com_ui_memory_key_validation');
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
  const [originalKey, setOriginalKey] = useState('');

  useEffect(() => {
    if (memory) {
      setKey(memory.key);
      setValue(memory.value);
      setOriginalKey(memory.key);
    }
  }, [memory]);

  const handleSave = () => {
    if (!hasUpdateAccess || !memory) {
      return;
    }

    if (!key.trim() || !value.trim()) {
      showToast({
        message: localize('com_ui_field_required'),
        status: 'error',
      });
      return;
    }

    updateMemory({
      key: key.trim(),
      value: value.trim(),
      ...(originalKey !== key.trim() && { originalKey }),
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey && hasUpdateAccess) {
      handleSave();
    }
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
      {children}
      <OGDialogTemplate
        title={hasUpdateAccess ? localize('com_ui_edit_memory') : localize('com_ui_view_memory')}
        showCloseButton={false}
        className="w-11/12 md:max-w-lg"
        main={
          <div className="space-y-4">
            {memory && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-text-secondary">
                  <div>
                    {localize('com_ui_date')}:{' '}
                    {new Date(memory.updated_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                  {/* Token Information */}
                  {memory.tokenCount !== undefined && (
                    <div>
                      {memory.tokenCount.toLocaleString()}
                      {memData?.tokenLimit && ` / ${memData.tokenLimit.toLocaleString()}`}{' '}
                      {localize(memory.tokenCount === 1 ? 'com_ui_token' : 'com_ui_tokens')}
                    </div>
                  )}
                </div>
                {/* Overall Memory Usage */}
                {memData?.tokenLimit && memData?.usagePercentage !== null && (
                  <div className="text-xs text-text-secondary">
                    {localize('com_ui_usage')}: {memData.usagePercentage}%{' '}
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="memory-key" className="text-sm font-medium">
                {localize('com_ui_key')}
              </Label>
              <Input
                id="memory-key"
                value={key}
                onChange={(e) => hasUpdateAccess && setKey(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={localize('com_ui_enter_key')}
                className="w-full"
                disabled={!hasUpdateAccess}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="memory-value" className="text-sm font-medium">
                {localize('com_ui_value')}
              </Label>
              <textarea
                id="memory-value"
                value={value}
                onChange={(e) => hasUpdateAccess && setValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={localize('com_ui_enter_value')}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                rows={3}
                disabled={!hasUpdateAccess}
              />
            </div>
          </div>
        }
        buttons={
          hasUpdateAccess ? (
            <Button
              type="button"
              variant="submit"
              onClick={handleSave}
              aria-label={localize('com_ui_save')}
              disabled={isLoading || !key.trim() || !value.trim()}
              className="text-white"
            >
              {isLoading ? <Spinner className="size-4" /> : localize('com_ui_save')}
            </Button>
          ) : null
        }
      />
    </OGDialog>
  );
}
