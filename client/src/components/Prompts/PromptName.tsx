import React, { useEffect, useState, useRef } from 'react';
import { Button, Label, Input, EditIcon, SaveIcon } from '~/components';

type Props = {
  name?: string;
  onSave: (newName: string) => void;
};

const PromptName: React.FC<Props> = ({ name, onSave }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimeoutRef = useRef<NodeJS.Timeout>();
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(name);

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewName(e.target.value);
  };

  const saveName = () => {
    const savedName = newName?.trim();
    onSave(savedName || '');
    setIsEditing(false);
  };

  const handleSaveClick: React.MouseEventHandler<HTMLButtonElement> = () => {
    saveName();
    clearTimeout(blurTimeoutRef.current);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditing(false);
      setNewName(name);
    }
    if (e.key === 'Enter') {
      saveName();
    }
  };

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    setNewName(name);
  }, [name]);

  return (
    <div className="flex items-center">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          alignItems: 'center',
        }}
        className="gap-2"
      >
        {isEditing ? (
          <>
            <Input
              type="text"
              value={newName ?? ''}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              ref={inputRef}
              className="flex w-full max-w-none rounded-lg text-2xl font-bold transition duration-200"
              style={{
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              }}
            />

            <Button
              onClick={handleSaveClick}
              variant="ghost"
              size="sm"
              className="h-10 flex-shrink-0"
            >
              <SaveIcon className="icon-md" />
            </Button>
          </>
        ) : (
          <>
            <Label
              className="text-2xl font-bold"
              style={{
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              }}
            >
              {newName}
            </Label>
            <Button
              onClick={handleEditClick}
              variant="ghost"
              size="sm"
              className="h-10 flex-shrink-0"
            >
              <EditIcon className="icon-md" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default PromptName;
