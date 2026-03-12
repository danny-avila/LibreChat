import React, { useState, useEffect } from 'react';
import {
  OGDialog,
  OGDialogTemplate,
  Button,
  Label,
  Input,
  Spinner,
  useToastContext,
} from '@librechat/client';
import type { TUserProject, UserProjectCreateParams, UserProjectUpdateParams } from 'librechat-data-provider';
import { useCreateUserProjectMutation, useUpdateUserProjectMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

const PROJECT_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: TUserProject | null;
  triggerRef?: React.MutableRefObject<HTMLButtonElement | null>;
}

export default function ProjectDialog({
  open,
  onOpenChange,
  project,
  triggerRef,
}: ProjectDialogProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[5]);

  const createMutation = useCreateUserProjectMutation();
  const updateMutation = useUpdateUserProjectMutation();

  const isEditing = !!project;
  const isPending = createMutation.isLoading || updateMutation.isLoading;

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? '');
      setInstructions(project.instructions ?? '');
      setColor(project.color ?? PROJECT_COLORS[5]);
    } else {
      setName('');
      setDescription('');
      setInstructions('');
      setColor(PROJECT_COLORS[5]);
    }
  }, [project, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }

    if (isEditing && project) {
      const data: UserProjectUpdateParams = {
        name: name.trim(),
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        color,
      };
      updateMutation.mutate(
        { projectId: project.projectId, data },
        {
          onSuccess: () => {
            onOpenChange(false);
            showToast({ message: 'Project updated', status: 'success' });
          },
          onError: () => {
            showToast({ message: 'Failed to update project', status: 'error' });
          },
        },
      );
    } else {
      const data: UserProjectCreateParams = {
        name: name.trim(),
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        color,
      };
      createMutation.mutate(data, {
        onSuccess: () => {
          onOpenChange(false);
          showToast({ message: 'Project created', status: 'success' });
        },
        onError: () => {
          showToast({ message: 'Failed to create project', status: 'error' });
        },
      });
    }
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
      <OGDialogTemplate
        title={isEditing ? localize('com_ui_edit_project') : localize('com_ui_create_project')}
        className="max-w-lg"
        showCloseButton={true}
        main={
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-name" className="text-sm font-medium text-text-primary">
                {localize('com_ui_project_name')}
              </Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={localize('com_ui_project_name')}
                maxLength={200}
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-desc" className="text-sm font-medium text-text-primary">
                {localize('com_ui_project_description')}
              </Label>
              <Input
                id="project-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={localize('com_ui_project_description')}
                maxLength={2000}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-instructions" className="text-sm font-medium text-text-primary">
                {localize('com_ui_project_instructions')}
              </Label>
              <textarea
                id="project-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={localize('com_ui_project_instructions_placeholder')}
                maxLength={50000}
                rows={4}
                className="resize-y rounded-lg border border-border-medium bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-green-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium text-text-primary">
                {localize('com_ui_project_color')}
              </Label>
              <div className="flex gap-2">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${
                      color === c ? 'scale-110 border-text-primary' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          </form>
        }
        buttons={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {localize('com_ui_cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={isPending || !name.trim()}>
              {isPending ? (
                <Spinner className="h-4 w-4" />
              ) : isEditing ? (
                localize('com_ui_save')
              ) : (
                localize('com_ui_create_project')
              )}
            </Button>
          </div>
        }
      />
    </OGDialog>
  );
}
