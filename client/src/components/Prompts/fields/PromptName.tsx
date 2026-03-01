import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Check, X, Pencil } from 'lucide-react';
import { Button, Input, Spinner, TooltipAnchor } from '@librechat/client';
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
        <div className="mr-3 flex min-w-0 flex-1 items-center gap-2">
          <Input
            type="text"
            value={newName ?? ''}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            ref={inputRef}
            disabled={isLoading}
            className="h-10 min-w-0 flex-1 rounded-lg border border-border-medium bg-surface-primary px-3 text-xl font-semibold text-text-primary transition-colors focus:border-border-heavy disabled:opacity-60 sm:text-2xl"
            aria-label={localize('com_ui_name')}
          />
          <div className="flex shrink-0 items-center gap-1">
            <TooltipAnchor
              description={isLoading ? localize('com_ui_loading') : localize('com_ui_save')}
              side="bottom"
              render={
                <Button
                  type="button"
                  onClick={saveName}
                  variant="submit"
                  size="icon"
                  disabled={isLoading}
                  aria-label={isLoading ? localize('com_ui_loading') : localize('com_ui_save')}
                >
                  {isLoading ? (
                    <Spinner size={16} className="text-white" />
                  ) : (
                    <Check className="size-4" aria-hidden="true" />
                  )}
                </Button>
              }
            />
            <TooltipAnchor
              description={localize('com_ui_cancel')}
              side="bottom"
              render={
                <Button
                  type="button"
                  onClick={handleCancel}
                  variant="outline"
                  size="icon"
                  disabled={isLoading}
                  aria-label={localize('com_ui_cancel')}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              }
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleTitleClick}
          onKeyDown={handleTitleKeyDown}
          className="group mr-3 flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={localize('com_ui_edit') + ' ' + localize('com_ui_name')}
        >
          <span className="block truncate text-xl font-semibold text-text-primary sm:text-2xl">
            {newName}
          </span>
          <Pencil
            className="size-4 shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
};

export default PromptName;
