import type { TUserMemory } from 'librechat-data-provider';
import MemoryCardActions from './MemoryCardActions';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface MemoryCardProps {
  memory: TUserMemory;
  hasUpdateAccess: boolean;
}

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export default function MemoryCard({ memory, hasUpdateAccess }: MemoryCardProps) {
  const localize = useLocalize();

  return (
    <div
      className={cn(
        'rounded-lg px-3 py-2.5',
        'border border-border-light bg-transparent',
        'hover:bg-surface-secondary',
      )}
    >
      {/* Row 1: Key + Token count + Actions */}
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-semibold text-text-primary">{memory.key}</span>
        {memory.tokenCount !== undefined && (
          <span className="shrink-0 text-xs text-text-secondary">
            {memory.tokenCount}{' '}
            {localize(memory.tokenCount === 1 ? 'com_ui_token' : 'com_ui_tokens')}
          </span>
        )}
        {hasUpdateAccess && (
          <div className="ml-auto shrink-0">
            <MemoryCardActions memory={memory} />
          </div>
        )}
      </div>

      {/* Row 2: Value + Date */}
      <div className="mt-1 flex items-baseline gap-2">
        <p className="min-w-0 flex-1 truncate text-sm text-text-primary" title={memory.value}>
          {memory.value}
        </p>
        <span className="shrink-0 text-xs text-text-secondary">
          {formatDate(memory.updated_at)}
        </span>
      </div>
    </div>
  );
}
