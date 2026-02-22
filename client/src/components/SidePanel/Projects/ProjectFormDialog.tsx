import React, { useState } from 'react';
import {
  Input,
  Label,
  Button,
  Spinner,
  OGDialog,
  OGDialogTemplate,
} from '@librechat/client';
import { useLocalize } from '~/hooks';

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  initialDescription?: string;
  isLoading?: boolean;
  onSubmit: (name: string, description?: string) => void;
  children?: React.ReactNode;
}

export default function ProjectFormDialog({
  open,
  onOpenChange,
  initialName = '',
  initialDescription = '',
  isLoading = false,
  onSubmit,
  children,
}: ProjectFormDialogProps) {
  const localize = useLocalize();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const isEdit = initialName.length > 0;

  const handleSubmit = () => {
    if (!name.trim()) {
      return;
    }
    onSubmit(name.trim(), description.trim() || undefined);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSubmit();
    }
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      {children}
      <OGDialogTemplate
        title={isEdit ? localize('com_ui_edit_project') : localize('com_ui_create_project')}
        showCloseButton={false}
        className="w-11/12 md:max-w-lg"
        main={
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name" className="text-sm font-medium text-text-primary">
                {localize('com_ui_name')}
              </Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyPress}
                maxLength={100}
                className="w-full"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="project-description"
                className="text-sm font-medium text-text-primary"
              >
                {localize('com_ui_description')}
              </Label>
              <textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={handleKeyPress}
                maxLength={500}
                rows={3}
                className="min-h-[80px] w-full resize-none rounded-lg border border-border-light bg-transparent px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-heavy"
              />
            </div>
          </div>
        }
        buttons={
          <Button
            type="button"
            variant="submit"
            onClick={handleSubmit}
            disabled={isLoading || !name.trim()}
            className="text-white"
            aria-label={
              isEdit ? localize('com_ui_edit_project') : localize('com_ui_create_project')
            }
          >
            {isLoading ? (
              <Spinner className="size-4" />
            ) : isEdit ? (
              localize('com_ui_save')
            ) : (
              localize('com_ui_create')
            )}
          </Button>
        }
      />
    </OGDialog>
  );
}
