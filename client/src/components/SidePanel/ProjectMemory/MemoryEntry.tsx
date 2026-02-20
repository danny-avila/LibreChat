import { useState, type FC } from 'react';
import { Pencil, Trash2, Check, X, Bot, User } from 'lucide-react';
import type { TMemoryEntry } from 'librechat-data-provider';
import { cn } from '~/utils';

type MemoryEntryProps = {
  entry: TMemoryEntry;
  onUpdate: (entryId: string, content: string) => void;
  onDelete: (entryId: string) => void;
};

const MemoryEntryComponent: FC<MemoryEntryProps> = ({ entry, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(entry.content);

  const handleSave = () => {
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== entry.content) {
      onUpdate(entry.entryId, trimmed);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditContent(entry.content);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className="group flex gap-2 rounded-lg border border-border-light p-2 text-sm">
      <div className="mt-0.5 flex-shrink-0">
        {entry.source === 'auto' ? (
          <Bot className="h-3.5 w-3.5 text-text-tertiary" />
        ) : (
          <User className="h-3.5 w-3.5 text-text-tertiary" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="flex flex-col gap-1">
            <textarea
              className="w-full rounded border border-border-medium bg-surface-primary px-2 py-1 text-sm text-text-primary outline-none focus:border-text-primary"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              autoFocus
            />
            <div className="flex gap-1">
              <button
                className="rounded p-0.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                onClick={handleSave}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                className="rounded p-0.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                onClick={handleCancel}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-1">
            <p className="text-text-primary">{entry.content}</p>
            <div
              className={cn(
                'flex flex-shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100',
              )}
            >
              <button
                className="rounded p-0.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                className="rounded p-0.5 text-text-secondary hover:bg-surface-hover hover:text-red-500"
                onClick={() => onDelete(entry.entryId)}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MemoryEntryComponent;
