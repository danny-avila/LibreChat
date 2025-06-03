import type { MemoryArtifact } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

export default function MemoryInfo({ memoryArtifacts }: { memoryArtifacts: MemoryArtifact[] }) {
  const localize = useLocalize();
  if (memoryArtifacts.length === 0) {
    return null;
  }

  // Group artifacts by type
  const updatedMemories = memoryArtifacts.filter((artifact) => artifact.type === 'update');
  const deletedMemories = memoryArtifacts.filter((artifact) => artifact.type === 'delete');

  if (updatedMemories.length === 0 && deletedMemories.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 p-4">
      {updatedMemories.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-text-primary">
            {localize('com_ui_memory_updated_items')}
          </h4>
          <div className="space-y-2">
            {updatedMemories.map((artifact, index) => (
              <div key={`update-${index}`} className="rounded-lg p-3">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">
                  {artifact.key}
                </div>
                <div className="whitespace-pre-wrap text-sm text-text-primary">
                  {artifact.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {deletedMemories.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-text-primary">
            {localize('com_ui_memory_deleted_items')}
          </h4>
          <div className="space-y-2">
            {deletedMemories.map((artifact, index) => (
              <div key={`delete-${index}`} className="rounded-lg p-3 opacity-60">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">
                  {artifact.key}
                </div>
                <div className="text-sm italic text-text-secondary">
                  {localize('com_ui_memory_deleted')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
