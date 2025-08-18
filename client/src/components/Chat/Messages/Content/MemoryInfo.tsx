import type { MemoryArtifact } from 'librechat-data-provider';
import { useMemo } from 'react';
import { useLocalize } from '~/hooks';

export default function MemoryInfo({ memoryArtifacts }: { memoryArtifacts: MemoryArtifact[] }) {
  const localize = useLocalize();

  const { updatedMemories, deletedMemories, errorMessages } = useMemo(() => {
    const updated = memoryArtifacts.filter((art) => art.type === 'update');
    const deleted = memoryArtifacts.filter((art) => art.type === 'delete');
    const errors = memoryArtifacts.filter((art) => art.type === 'error');

    const messages = errors.map((artifact) => {
      try {
        const errorData = JSON.parse(artifact.value as string);

        if (errorData.errorType === 'already_exceeded') {
          return localize('com_ui_memory_already_exceeded', {
            tokens: errorData.tokenCount,
          });
        } else if (errorData.errorType === 'would_exceed') {
          return localize('com_ui_memory_would_exceed', {
            tokens: errorData.tokenCount,
          });
        } else {
          return localize('com_ui_memory_error');
        }
      } catch {
        return localize('com_ui_memory_error');
      }
    });

    return {
      updatedMemories: updated,
      deletedMemories: deleted,
      errorMessages: messages,
    };
  }, [memoryArtifacts, localize]);

  if (memoryArtifacts.length === 0) {
    return null;
  }

  if (updatedMemories.length === 0 && deletedMemories.length === 0 && errorMessages.length === 0) {
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
            {updatedMemories.map((artifact) => (
              <div key={`update-${artifact.key}`} className="rounded-lg p-3">
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
            {deletedMemories.map((artifact) => (
              <div key={`delete-${artifact.key}`} className="rounded-lg p-3 opacity-60">
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

      {errorMessages.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-red-500">
            {localize('com_ui_memory_storage_full')}
          </h4>
          <div className="space-y-2">
            {errorMessages.map((errorMessage) => (
              <div
                key={errorMessage}
                className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-400"
              >
                {errorMessage}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
