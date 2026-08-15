import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  MAX_CHAT_PROJECT_NAME_LENGTH,
  MAX_CHAT_PROJECT_DESCRIPTION_LENGTH,
} from 'librechat-data-provider';
import {
  Button,
  Input,
  Label,
  OGDialog,
  OGDialogTemplate,
  Spinner,
  Textarea,
  useToastContext,
} from '@librechat/client';
import type { TChatProject } from 'librechat-data-provider';
import { useUpdateProjectMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';

type ProjectEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: TChatProject;
};

export default function ProjectEditDialog({ open, onOpenChange, project }: ProjectEditDialogProps) {
  const localize = useLocalize();
  const formId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [wasOpen, setWasOpen] = useState(open);
  const updateProject = useUpdateProjectMutation();
  const { showToast } = useToastContext();

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(project.name);
      setDescription(project.description ?? '');
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    const frameId = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frameId);
  }, [open]);

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const isUnchanged =
    trimmedName === project.name && trimmedDescription === (project.description ?? '').trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedName || isUnchanged || updateProject.isLoading) {
      return;
    }

    updateProject.mutate(
      {
        projectId: project._id,
        name: trimmedName,
        description: trimmedDescription,
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: () =>
          showToast({
            message: localize('com_ui_project_rename_error'),
            severity: NotificationSeverity.ERROR,
            showIcon: true,
          }),
      },
    );
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        title={localize('com_ui_edit_project')}
        showCloseButton={false}
        className="w-11/12 max-w-md"
        main={
          <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor={`${formId}-name`} className="text-sm font-medium text-text-primary">
                {localize('com_ui_project_name')}
              </Label>
              <Input
                id={`${formId}-name`}
                ref={inputRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={MAX_CHAT_PROJECT_NAME_LENGTH}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor={`${formId}-description`}
                className="text-sm font-medium text-text-primary"
              >
                {localize('com_ui_description')}{' '}
                <span className="font-normal text-text-secondary">
                  {localize('com_ui_optional')}
                </span>
              </Label>
              <Textarea
                id={`${formId}-description`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                maxLength={MAX_CHAT_PROJECT_DESCRIPTION_LENGTH}
                className="min-h-[4.5rem] bg-transparent"
              />
            </div>
          </form>
        }
        buttons={
          <Button
            type="submit"
            form={formId}
            variant="submit"
            disabled={!trimmedName || isUnchanged || updateProject.isLoading}
            className="active:scale-[0.96]"
          >
            {updateProject.isLoading ? <Spinner className="size-4" /> : localize('com_ui_save')}
          </Button>
        }
      />
    </OGDialog>
  );
}
