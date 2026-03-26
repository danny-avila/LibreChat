import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Pencil, Check, Loader2 } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type Props = {
  name?: string;
  isLoading?: boolean;
  onSave: (newName: string) => void;
};

type SaveStatus = 'idle' | 'saving' | 'saved';

const PromptName: React.FC<Props> = ({ name, isLoading = false, onSave }) => {
  const localize = useLocalize();
  const inputRef = useRef<HTMLInputElement>(null);
  const wasLoadingRef = useRef(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(name);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewName(e.target.value);
  }, []);

  const saveName = useCallback(() => {
    const savedName = newName?.trim();
    if (savedName && savedName !== name) {
      setSaveStatus('saving');
      onSave(savedName);
    } else {
      setNewName(name);
    }
    setIsEditing(false);
  }, [newName, name, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setNewName(name);
        setIsEditing(false);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        saveName();
      }
    },
    [name, saveName],
  );

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (isLoading) {
      setSaveStatus('saving');
    } else if (wasLoadingRef.current && !isLoading) {
      setSaveStatus('saved');
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    setNewName(name);
  }, [name]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="group/title relative mr-2 flex h-8 min-w-0 flex-1 items-center">
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={newName ?? ''}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={saveName}
          disabled={isLoading}
          className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent pl-2 pr-0 text-base font-semibold text-text-primary outline-none focus:border-border-medium focus:outline-none disabled:opacity-60"
          aria-label={localize('com_ui_name')}
        />
      ) : (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="h-8 min-w-0 flex-1 cursor-text truncate pl-2 text-left text-base font-semibold text-text-primary transition-colors hover:text-text-secondary focus:outline-none"
          title={newName}
          aria-label={localize('com_ui_edit') + ': ' + (newName ?? '')}
        >
          {newName}
        </button>
      )}
      <div className="ml-1.5 flex shrink-0 items-center justify-center">
        {saveStatus === 'saving' && (
          <Loader2
            className="size-4 animate-spin text-text-secondary"
            aria-label={localize('com_ui_saving')}
          />
        )}
        {saveStatus === 'saved' && (
          <Check
            className={cn(
              'size-4 text-green-500 transition-opacity duration-300',
              saveStatus === 'saved' ? 'opacity-100' : 'opacity-0',
            )}
            aria-label={localize('com_ui_saved')}
          />
        )}
        {saveStatus === 'idle' && !isEditing && (
          <Pencil
            className="size-3.5 text-text-secondary opacity-0 transition-opacity group-hover/title:opacity-100"
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
};

export default PromptName;
