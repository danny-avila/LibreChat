import { useState, useEffect, useCallback } from 'react';
import { Save } from 'lucide-react';
import { Button, Spinner, useToastContext } from '@librechat/client';
import type { TMemoryDocument } from 'librechat-data-provider';
import { useUpdateMemoryDocument } from '~/data-provider';
import { useLocalize } from '~/hooks';

interface MemoryDocumentEditorProps {
  document: TMemoryDocument | null;
  scope: 'global' | 'project';
  projectId?: string;
}

export default function MemoryDocumentEditor({
  document,
  scope,
  projectId,
}: MemoryDocumentEditorProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [content, setContent] = useState(document?.content ?? '');
  const [isDirty, setIsDirty] = useState(false);
  const updateMutation = useUpdateMemoryDocument();

  useEffect(() => {
    setContent(document?.content ?? '');
    setIsDirty(false);
  }, [document]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    updateMutation.mutate(
      { scope, projectId, data: { content } },
      {
        onSuccess: () => {
          showToast({ message: localize('com_ui_memory_updated'), status: 'success' });
          setIsDirty(false);
        },
        onError: () => {
          showToast({ message: localize('com_ui_error'), status: 'error' });
        },
      },
    );
  }, [scope, projectId, content, updateMutation, showToast, localize]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (isDirty) {
          handleSave();
        }
      }
    },
    [isDirty, handleSave],
  );

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span>{document?.tokenCount ?? 0} tokens</span>
          {document?.updatedAt && (
            <>
              <span aria-hidden="true">&middot;</span>
              <span>
                {localize('com_ui_last_updated')}: {new Date(document.updatedAt).toLocaleDateString()}
              </span>
            </>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={!isDirty || updateMutation.isLoading}
          className="gap-1"
        >
          {updateMutation.isLoading ? (
            <Spinner className="size-3" />
          ) : (
            <Save className="size-3" />
          )}
          {localize('com_ui_save')}
        </Button>
      </div>
      <textarea
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="flex-1 resize-none rounded-lg border border-border-light bg-surface-primary p-3 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-heavy focus:outline-none"
        placeholder={localize('com_ui_memory_document_placeholder')}
        spellCheck={false}
      />
    </div>
  );
}
