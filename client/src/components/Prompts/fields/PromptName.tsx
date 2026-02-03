import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Check, X } from 'lucide-react';
import { Button, Input, Spinner } from '@librechat/client';
import { useLocalize } from '~/hooks';

type Props = {
  name?: string;
  isLoading?: boolean;
  onSave: (newName: string) => void;
};

const PromptName: React.FC<Props> = ({ name, isLoading = false, onSave }) => {
  const localize = useLocalize();
  const inputRef = useRef<HTMLInputElement>(null);
  const wasLoadingRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(name);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewName(e.target.value);
  }, []);

  const handleCancel = useCallback(() => {
    if (isLoading) {
      return;
    }
    setIsEditing(false);
    setNewName(name);
  }, [name, isLoading]);

  const saveName = useCallback(() => {
    if (isLoading) {
      return;
    }
    const savedName = newName?.trim();
    if (savedName && savedName !== name) {
      onSave(savedName);
    } else {
      setIsEditing(false);
    }
  }, [newName, name, onSave, isLoading]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        saveName();
      }
    },
    [handleCancel, saveName],
  );

  const handleTitleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsEditing(true);
    }
  }, []);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Track loading state for detecting save completion
  useEffect(() => {
    wasLoadingRef.current = isLoading;
  }, [isLoading]);

  // Close editing when name updates after save (loading finished)
  useEffect(() => {
    setNewName(name);
    if (wasLoadingRef.current) {
      setIsEditing(false);
      wasLoadingRef.current = false;
    }
  }, [name]);

  return (
    <div className="flex min-w-0 flex-1 items-center">
      {isEditing ? (
        <div className="mr-3 flex min-w-0 flex-1 items-center gap-1">
          <Input
            type="text"
            value={newName ?? ''}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            ref={inputRef}
            disabled={isLoading}
            className="h-10 min-w-0 flex-1 rounded-lg border-border-medium px-3 text-xl font-bold text-text-primary disabled:opacity-70 sm:text-2xl"
            aria-label={localize('com_ui_name')}
          />
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              onClick={saveName}
              variant="ghost"
              size="icon"
              disabled={isLoading}
              className="size-10 p-0 text-text-secondary hover:text-text-primary disabled:opacity-50"
              aria-label={isLoading ? localize('com_ui_loading') : localize('com_ui_save')}
            >
              {isLoading ? (
                <Spinner size={24} className="" />
              ) : (
                <Check className="size-6" aria-hidden="true" />
              )}
            </Button>
            <Button
              type="button"
              onClick={handleCancel}
              variant="ghost"
              size="icon"
              disabled={isLoading}
              className="size-10 p-0 text-text-secondary hover:text-text-primary disabled:opacity-50"
              aria-label={localize('com_ui_cancel')}
            >
              <X className="size-6" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleTitleClick}
          onKeyDown={handleTitleKeyDown}
          className="mr-3 min-w-0 flex-1 cursor-pointer rounded-lg px-1 py-1 text-left transition-colors duration-150 hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy"
          aria-label={localize('com_ui_edit') + ' ' + localize('com_ui_name')}
        >
          <span className="ml-2 block truncate text-xl font-bold text-text-primary sm:text-2xl">
            {newName}
          </span>
        </button>
      )}
    </div>
  );
};

export default PromptName;
