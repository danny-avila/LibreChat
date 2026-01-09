import type { TUserMemory } from 'librechat-data-provider';
import { MemoryViewDialog, MemoryEditDialog, MemoryDeleteDialog } from './Dialogs';

interface MemoryCardActionsProps {
  memory: TUserMemory;
  hasUpdateAccess: boolean;
}

export default function MemoryCardActions({ memory, hasUpdateAccess }: MemoryCardActionsProps) {
  if (!hasUpdateAccess) {
    return <MemoryViewDialog memory={memory} />;
  }

  return (
    <div className="flex items-center gap-0.5">
      {/* Edit */}
      <MemoryEditDialog memory={memory} />

      {/* Delete */}
      <MemoryDeleteDialog memory={memory} />
    </div>
  );
}
