import type { TUserMemory } from 'librechat-data-provider';
import MemoryEmptyState from './MemoryEmptyState';
import MemoryCard from './MemoryCard';
import { useLocalize } from '~/hooks';

interface MemoryListProps {
  memories: TUserMemory[];
  hasUpdateAccess: boolean;
  isFiltered?: boolean;
}

export default function MemoryList({
  memories,
  hasUpdateAccess,
  isFiltered = false,
}: MemoryListProps) {
  const localize = useLocalize();

  if (memories.length === 0) {
    return <MemoryEmptyState isFiltered={isFiltered} />;
  }

  return (
    <div className="space-y-2" role="list" aria-label={localize('com_ui_memories')}>
      {memories.map((memory) => (
        <div key={memory.key} role="listitem">
          <MemoryCard memory={memory} hasUpdateAccess={hasUpdateAccess} />
        </div>
      ))}
    </div>
  );
}
