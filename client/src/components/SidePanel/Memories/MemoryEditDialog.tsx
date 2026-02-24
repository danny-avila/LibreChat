import React, { useState, useEffect, useMemo } from 'react';
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
import MemoryUsageBadge from './MemoryUsageBadge';

interface MemoryEditDialogProps {
  memory: TUserMemory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  triggerRef?: React.MutableRefObject<HTMLButtonElement | null>;
}

const formatDateTime = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

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

  // Calculate memory-specific usage: available = tokenLimit - (totalTokens - thisMemoryTokens)
  const memoryUsage = useMemo(() => {
    if (!memory?.tokenCount || !memData?.tokenLimit) {
      return null;
    }
    const availableForMemory = memData.tokenLimit - (memData.totalTokens ?? 0) + memory.tokenCount;
    const percentage = Math.round((memory.tokenCount / availableForMemory) * 100);
    return { availableForMemory, percentage };
  }, [memory?.tokenCount, memData?.tokenLimit, memData?.totalTokens]);

  return (
    <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
      {children}
      <OGDialogTemplate
        title={hasUpdateAccess ? localize('com_ui_edit_memory') : localize('com_ui_view_memory')}
        showCloseButton={false}
        className="w-11/12 md:max-w-lg"
        main={
          <div className="space-y-4">
            {/* Memory metadata */}
            {memory && (
              <div className="flex items-center justify-between rounded-lg border border-border-light bg-surface-secondary px-3 py-2">
                {/* Token count - Left */}
                {memory.tokenCount !== undefined ? (
                  <span className="text-xs text-text-secondary">
                    {memory.tokenCount.toLocaleString()}{' '}
                    {localize(memory.tokenCount === 1 ? 'com_ui_token' : 'com_ui_tokens')}
                  </span>
                ) : (
                  <div />
                )}

                {/* Date - Center */}
                <span className="text-xs text-text-secondary">
                  {formatDateTime(memory.updated_at)}
                </span>

                {/* Usage badge - Right (memory-specific) */}
                {memoryUsage ? (
                  <MemoryUsageBadge
                    percentage={memoryUsage.percentage}
                    tokenLimit={memData?.tokenLimit ?? 0}
                    tooltipCurrent={memory.tokenCount}
                    tooltipMax={memoryUsage.availableForMemory}
                  />
                ) : (
                  <div />
                )}
              </div>
            )}

            {/* Key input */}
            <div className="space-y-2">
              <Label htmlFor="memory-key" className="text-sm font-medium text-text-primary">
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

            {/* Value textarea */}
            <div className="space-y-2">
              <Label htmlFor="memory-value" className="text-sm font-medium text-text-primary">
                {localize('com_ui_value')}
              </Label>
              <textarea
                id="memory-value"
                value={value}
                onChange={(e) => hasUpdateAccess && setValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={localize('com_ui_enter_value')}
                className="min-h-[100px] w-full resize-none rounded-lg border border-border-light bg-transparent px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-heavy disabled:cursor-not-allowed disabled:opacity-50"
                rows={4}
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
