import React, { forwardRef } from 'react';
import { Workflow } from 'lucide-react';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';
import cn from '~/utils/cn';

interface MermaidArtifactCardProps {
  artifactId: string;
  isSelected: boolean;
  title: string;
  onClick: () => void;
}

const MermaidArtifactCard = forwardRef<HTMLButtonElement, MermaidArtifactCardProps>(
  ({ artifactId, isSelected, title, onClick }, ref) => {
    const localize = useLocalize();
    const actionLabel = isSelected
      ? localize('com_ui_close_artifact')
      : localize('com_ui_open_artifact');

    return (
      <Button
        ref={ref}
        variant="subtle"
        aria-controls="artifact-viewer"
        aria-expanded={isSelected}
        data-artifact-trigger={artifactId}
        onClick={onClick}
        className={cn(
          'group my-2 h-auto w-fit max-w-full justify-start gap-2 overflow-hidden whitespace-normal rounded-xl p-2 text-left text-sm shadow-sm',
          'border-border-light bg-surface-tertiary transition-all duration-200 hover:bg-surface-hover active:scale-[0.99] motion-reduce:transition-none',
          isSelected && 'border-border-medium bg-surface-hover',
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-status-info-subtle text-status-info">
          <Workflow className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 max-w-64 flex-1 overflow-hidden">
          <span className="block truncate font-medium text-text-primary">{title}</span>
          <span className="block truncate text-xs font-normal text-text-secondary">
            {actionLabel}
          </span>
        </span>
      </Button>
    );
  },
);

MermaidArtifactCard.displayName = 'MermaidArtifactCard';

export default MermaidArtifactCard;
