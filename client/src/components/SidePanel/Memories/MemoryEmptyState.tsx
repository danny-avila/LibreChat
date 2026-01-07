import { Brain } from 'lucide-react';
import { useLocalize } from '~/hooks';

interface MemoryEmptyStateProps {
  isFiltered?: boolean;
}

export default function MemoryEmptyState({ isFiltered = false }: MemoryEmptyStateProps) {
  const localize = useLocalize();

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border-light bg-transparent p-6 text-center">
      <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-surface-tertiary">
        <Brain className="size-5 text-text-secondary" aria-hidden="true" />
      </div>
      {isFiltered ? (
        <p className="text-sm text-text-secondary">{localize('com_ui_no_memories_match')}</p>
      ) : (
        <>
          <p className="text-sm font-medium text-text-primary">
            {localize('com_ui_no_memories_title')}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">{localize('com_ui_no_memories')}</p>
        </>
      )}
    </div>
  );
}
