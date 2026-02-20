import { useState } from 'react';
import { useRecoilValue } from 'recoil';
import { Plus, Brain } from 'lucide-react';
import {
  useGetProjectMemoryQuery,
  useAddProjectMemoryMutation,
  useUpdateProjectMemoryMutation,
  useDeleteProjectMemoryMutation,
} from '~/data-provider';
import MemoryEntry from './MemoryEntry';
import store from '~/store';

export default function ProjectMemoryPanel() {
  const activeProjectId = useRecoilValue(store.activeProjectId);
  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState('');

  const { data: memories = [] } = useGetProjectMemoryQuery(activeProjectId);
  const addMutation = useAddProjectMemoryMutation();
  const updateMutation = useUpdateProjectMemoryMutation();
  const deleteMutation = useDeleteProjectMemoryMutation();

  if (!activeProjectId) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
        <Brain className="h-8 w-8 text-text-tertiary" />
        <p className="text-sm text-text-secondary">
          Select a project to view its memory.
        </p>
        <p className="text-xs text-text-tertiary">
          Project memory stores key facts from conversations that are automatically injected into
          future chats.
        </p>
      </div>
    );
  }

  const handleAdd = () => {
    const trimmed = newContent.trim();
    if (!trimmed || !activeProjectId) {
      return;
    }
    addMutation.mutate(
      { projectId: activeProjectId, content: trimmed, source: 'manual', category: 'general' },
      {
        onSuccess: () => {
          setNewContent('');
          setIsAdding(false);
        },
      },
    );
  };

  const handleUpdate = (entryId: string, content: string) => {
    if (!activeProjectId) {
      return;
    }
    updateMutation.mutate({ projectId: activeProjectId, entryId, content });
  };

  const handleDelete = (entryId: string) => {
    if (!activeProjectId) {
      return;
    }
    deleteMutation.mutate({ projectId: activeProjectId, entryId });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Escape') {
      setIsAdding(false);
      setNewContent('');
    }
  };

  return (
    <div className="flex h-auto max-w-full flex-col gap-2 overflow-x-hidden p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">
          Project Memory ({memories.length})
        </h3>
        <button
          className="rounded-md p-1 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          onClick={() => setIsAdding(!isAdding)}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {isAdding && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border-medium bg-surface-primary p-2">
          <textarea
            className="w-full resize-none rounded border border-border-light bg-transparent px-2 py-1 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-text-primary"
            placeholder="Add a fact to remember..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            autoFocus
          />
          <div className="flex justify-end gap-1">
            <button
              className="rounded px-2 py-0.5 text-xs text-text-secondary hover:bg-surface-hover"
              onClick={() => {
                setIsAdding(false);
                setNewContent('');
              }}
            >
              Cancel
            </button>
            <button
              className="rounded bg-surface-hover px-2 py-0.5 text-xs text-text-primary hover:bg-surface-tertiary disabled:opacity-50"
              onClick={handleAdd}
              disabled={!newContent.trim() || addMutation.isLoading}
            >
              Add
            </button>
          </div>
        </div>
      )}

      {memories.length === 0 ? (
        <p className="py-4 text-center text-xs text-text-tertiary">
          No memory entries yet. Facts will be automatically extracted from conversations, or you
          can add them manually.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {memories.map((entry) => (
            <MemoryEntry
              key={entry.entryId}
              entry={entry}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
