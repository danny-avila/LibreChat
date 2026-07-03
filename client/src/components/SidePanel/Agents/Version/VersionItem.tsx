import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Check, RotateCcw, Circle } from 'lucide-react';
import {
  Label,
  OGDialog,
  OGDialogTrigger,
  OGDialogTemplate,
  TooltipAnchor,
} from '@librechat/client';
import type { VersionRecord } from './types';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type VersionItemProps = {
  version: VersionRecord;
  index: number;
  isActive: boolean;
  versionsLength: number;
  onRestore: (index: number) => void;
};

function getTimestampDate(version: VersionRecord): Date | null {
  const value = version.updatedAt ?? version.createdAt;
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function countItems(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export default function VersionItem({
  version,
  index,
  isActive,
  versionsLength,
  onRestore,
}: VersionItemProps) {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);

  const versionNumber = versionsLength - index;
  const isLatest = index === 0;
  const isLast = index === versionsLength - 1;

  const date = getTimestampDate(version);
  const hasUpdatedAt = version.updatedAt != null;
  const hasCreatedAt = version.createdAt != null;
  const fallbackDateLabel = localize(
    hasUpdatedAt || hasCreatedAt
      ? 'com_ui_agent_version_unknown_date'
      : 'com_ui_agent_version_no_date',
  );
  const relativeLabel = date ? formatDistanceToNow(date, { addSuffix: true }) : fallbackDateLabel;
  const absoluteLabel = date ? date.toLocaleString() : relativeLabel;

  const toolsCount = countItems(version.tools);
  const capabilitiesCount = countItems(version.capabilities);
  const summaryChips: Array<{ key: string; label: string }> = [];
  if (toolsCount > 0) {
    summaryChips.push({
      key: 'tools',
      label: localize(toolsCount === 1 ? 'com_ui_tools_count_one' : 'com_ui_tools_count', {
        count: toolsCount,
      }),
    });
  }
  if (capabilitiesCount > 0) {
    summaryChips.push({
      key: 'capabilities',
      label: localize(
        capabilitiesCount === 1 ? 'com_ui_capabilities_count_one' : 'com_ui_capabilities_count',
        { count: capabilitiesCount },
      ),
    });
  }

  const versionName = typeof version.name === 'string' ? version.name : null;
  const versionTitle = localize('com_ui_agent_version_title', { versionNumber });

  return (
    <li className="relative flex items-stretch" aria-current={isActive ? 'true' : undefined}>
      {/* Timeline rail */}
      <div className="relative flex w-6 shrink-0 justify-center">
        {!isLast && (
          <div
            className={cn(
              'absolute -bottom-3 top-0 w-px',
              isActive ? 'bg-green-500/40' : 'bg-border-light',
            )}
          />
        )}
        <div
          className={cn(
            'relative z-10 mt-4 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            isActive
              ? 'border-green-500 bg-green-500 text-white'
              : 'border-border-medium bg-surface-primary text-text-secondary',
          )}
          aria-hidden="true"
        >
          {isActive ? (
            <Check className="size-3" strokeWidth={3} />
          ) : (
            <Circle className="size-1.5" fill="currentColor" />
          )}
        </div>
      </div>

      {/* Card */}
      <div
        className={cn(
          'group relative mb-2 ml-2 flex flex-1 flex-col rounded-xl border p-3 transition-colors',
          isActive
            ? 'border-green-500/40 bg-green-50/60 dark:border-green-500/30 dark:bg-green-950/20'
            : 'border-border-light bg-transparent hover:border-border-medium hover:bg-surface-secondary',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'truncate text-sm font-semibold',
                  isActive ? 'text-green-700 dark:text-green-300' : 'text-text-primary',
                )}
              >
                {versionTitle}
              </span>
              {isActive && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-300">
                  <span className="size-1.5 rounded-full bg-green-500" aria-hidden="true" />
                  {localize('com_ui_agent_version_current')}
                </span>
              )}
              {!isActive && isLatest && (
                <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                  {localize('com_ui_latest')}
                </span>
              )}
            </div>
            {versionName && (
              <span className="mt-0.5 truncate text-xs text-text-secondary" title={versionName}>
                {versionName}
              </span>
            )}
          </div>
          {!isActive && (
            <OGDialog open={open} onOpenChange={setOpen}>
              <OGDialogTrigger asChild>
                <TooltipAnchor
                  description={localize('com_ui_agent_version_restore')}
                  side="left"
                  render={
                    <button
                      type="button"
                      aria-label={localize('com_ui_agent_version_restore')}
                      className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-border-light text-text-secondary opacity-0 transition-all hover:border-border-medium hover:bg-surface-hover hover:text-text-primary focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring-primary group-hover:opacity-100"
                    >
                      <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  }
                />
              </OGDialogTrigger>
              <OGDialogTemplate
                title={localize('com_ui_agent_version_restore_confirm')}
                className="max-w-[450px]"
                main={
                  <div className="flex w-full flex-col gap-3 text-sm">
                    <Label className="text-left font-medium text-text-primary">
                      {localize('com_ui_agent_version_restore_description')}
                    </Label>
                    <div className="rounded-lg border border-border-light bg-surface-secondary px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-text-primary">
                          {versionTitle}
                        </span>
                        <time
                          className="text-xs text-text-secondary"
                          dateTime={date?.toISOString()}
                        >
                          {absoluteLabel}
                        </time>
                      </div>
                      {versionName && (
                        <div className="mt-1 truncate text-xs text-text-secondary">
                          {versionName}
                        </div>
                      )}
                    </div>
                  </div>
                }
                selection={{
                  selectHandler: () => onRestore(index),
                  selectClasses:
                    'bg-green-600 hover:bg-green-700 dark:hover:bg-green-700 text-white',
                  selectText: localize('com_ui_agent_version_restore'),
                }}
              />
            </OGDialog>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {date ? (
            <TooltipAnchor
              description={absoluteLabel}
              side="bottom"
              render={
                <time
                  dateTime={date.toISOString()}
                  className="cursor-help text-xs text-text-secondary"
                >
                  {relativeLabel}
                </time>
              }
            />
          ) : (
            <span className="text-xs text-text-secondary">{relativeLabel}</span>
          )}
          {summaryChips.length > 0 && (
            <>
              <span aria-hidden="true" className="text-text-tertiary">
                ·
              </span>
              {summaryChips.map((chip, i) => (
                <span key={chip.key} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <span aria-hidden="true" className="text-text-tertiary">
                      ·
                    </span>
                  )}
                  <span className="text-xs text-text-secondary">{chip.label}</span>
                </span>
              ))}
            </>
          )}
        </div>
      </div>
    </li>
  );
}
