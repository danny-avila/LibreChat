import React, { useState, useMemo } from 'react';
import { Eye } from 'lucide-react';
import {
  OGDialog,
  OGDialogTrigger,
  OGDialogTemplate,
  Label,
  Input,
  Button,
  Textarea,
  TooltipAnchor,
} from '@librechat/client';
import type { TUserMemory } from 'librechat-data-provider';
import { useMemoriesQuery } from '~/data-provider';
import MemoryUsageBadge from '../MemoryUsageBadge';
import { useLocalize } from '~/hooks';

interface MemoryEditDialogProps {
  memory: TUserMemory | null;
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

export default function MemoryEditDialog({ memory }: MemoryEditDialogProps) {
  const localize = useLocalize();
  const { data: memData } = useMemoriesQuery();

  const [viewTrue, setViewTrue] = useState(false);

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
    <OGDialog open={viewTrue} onOpenChange={setViewTrue}>
      <OGDialogTrigger asChild>
        <TooltipAnchor
          description={localize('com_ui_view')}
          side="top"
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={localize('com_ui_view')}
              onClick={() => setViewTrue(true)}
            >
              <Eye className="size-4" aria-hidden="true" />
            </Button>
          }
        />
      </OGDialogTrigger>
      <OGDialogTemplate
        title={localize('com_ui_view_memory')}
        className="w-11/12 md:max-w-lg"
        showCloseButton={true}
        showCancelButton={false}
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
                value={memory?.key}
                placeholder={localize('com_ui_enter_key')}
                disabled={true}
                className="w-full"
              />
            </div>

            {/* Value textarea */}
            <div className="space-y-2">
              <Label htmlFor="memory-value" className="text-sm font-medium text-text-primary">
                {localize('com_ui_value')}
              </Label>
              <Textarea
                id="memory-value"
                value={memory?.value}
                placeholder={localize('com_ui_enter_value')}
                rows={4}
                disabled={true}
                className="min-h-[100px]"
              />
            </div>
          </div>
        }
      />
    </OGDialog>
  );
}
