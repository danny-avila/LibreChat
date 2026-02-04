import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Zap, Circle, CheckCircle2 } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import type { TPrompt, TPromptGroup } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const VersionBadge = ({
  type,
  tooltip,
  label,
}: {
  type: 'latest' | 'production';
  tooltip: string;
  label: string;
}) => {
  const isProduction = type === 'production';

  return (
    <TooltipAnchor
      description={tooltip}
      side="left"
      render={
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            isProduction
              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
          )}
        >
          {isProduction ? (
            <>
              <span className="slow-pulse size-1.5 rounded-full bg-green-500" />
              <span>{label}</span>
            </>
          ) : (
            <>
              <Zap className="size-3" />
              <span>{label}</span>
            </>
          )}
        </span>
      }
    />
  );
};

const getTimelineConnectorClasses = (isSelected: boolean, isProduction: boolean) => {
  if (isSelected) {
    return 'border-green-500 bg-green-500 text-white';
  }
  if (isProduction) {
    return 'border-green-400 bg-surface-primary text-green-500';
  }
  return 'border-border-medium bg-surface-primary text-text-secondary';
};

const VersionCard = ({
  prompt,
  index,
  isSelected,
  totalVersions,
  onClick,
  isLatest,
  isProduction,
}: {
  prompt: TPrompt;
  index: number;
  isSelected: boolean;
  totalVersions: number;
  onClick: () => void;
  isLatest: boolean;
  isProduction: boolean;
}) => {
  const localize = useLocalize();
  const versionNumber = totalVersions - index;

  return (
    <div className="relative flex items-stretch">
      {/* Timeline connector */}
      <div className="relative flex w-6 shrink-0 flex-col items-center pt-3">
        <div
          className={cn(
            'z-10 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            getTimelineConnectorClasses(isSelected, isProduction),
          )}
        >
          {isSelected ? (
            <CheckCircle2 className="size-3" />
          ) : (
            <Circle className="size-2" fill="currentColor" />
          )}
        </div>
        {index < totalVersions - 1 && <div className="w-0.5 flex-1 bg-border-light" />}
      </div>

      {/* Card content */}
      <button
        type="button"
        className={cn(
          'group mb-2 ml-2 flex flex-1 flex-col rounded-lg border p-3 text-left',
          isSelected
            ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20'
            : 'border-border-light bg-surface-primary hover:border-border-medium hover:bg-surface-hover',
        )}
        onClick={onClick}
        aria-selected={isSelected}
        role="tab"
        aria-label={localize('com_ui_version_var', { 0: `${versionNumber}` })}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'text-sm font-semibold',
              isSelected ? 'text-green-700 dark:text-green-400' : 'text-text-primary',
            )}
          >
            {localize('com_ui_version_var', { 0: versionNumber })}
          </span>
          <div className="flex items-center gap-1">
            {isProduction && (
              <VersionBadge
                type="production"
                tooltip={localize('com_ui_currently_production')}
                label={localize('com_ui_live')}
              />
            )}
            {isLatest && !isProduction && (
              <VersionBadge
                type="latest"
                tooltip={localize('com_ui_latest_version')}
                label={localize('com_ui_latest')}
              />
            )}
          </div>
        </div>

        <time
          className="mt-1 text-xs text-text-secondary"
          dateTime={prompt.createdAt}
          title={new Date(prompt.createdAt).toLocaleString()}
        >
          {formatDistanceToNow(new Date(prompt.createdAt), { addSuffix: true })}
        </time>
      </button>
    </div>
  );
};

const PromptVersions = ({
  prompts,
  group,
  selectionIndex,
  setSelectionIndex,
}: {
  prompts: TPrompt[];
  group?: TPromptGroup;
  selectionIndex: number;
  setSelectionIndex: React.Dispatch<React.SetStateAction<number>>;
}) => {
  return (
    <div className="flex flex-col" role="tablist" aria-label="Version history">
      {prompts.map((prompt: TPrompt, index: number) => {
        const isLatest = index === 0;
        const isProduction = prompt._id === group?.productionId;

        return (
          <VersionCard
            key={prompt._id}
            prompt={prompt}
            index={index}
            isSelected={index === selectionIndex}
            totalVersions={prompts.length}
            onClick={() => setSelectionIndex(index)}
            isLatest={isLatest}
            isProduction={isProduction}
          />
        );
      })}
    </div>
  );
};

export default PromptVersions;
