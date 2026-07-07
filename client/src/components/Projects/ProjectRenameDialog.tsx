import { useEffect, useId, useRef, useState } from 'react';
import {
  Button,
  Input,
  Spinner,
  OGDialog,
  OGDialogClose,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
  useToastContext,
} from '@librechat/client';
import type { TChatProject } from 'librechat-data-provider';
import { useUpdateProjectMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';

export default function ProjectRenameDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: TChatProject;
}) {
  const localize = useLocalize();
  const formId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(project.name);
  const updateProject = useUpdateProjectMutation();
  const { showToast } = useToastContext();

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(project.name);
    const frameId = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frameId);
  }, [open, project.name]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || updateProject.isLoading) {
      return;
    }
    updateProject.mutate(
      { projectId: project._id, name: trimmed },
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
      <OGDialogContent className="w-11/12 max-w-md" showCloseButton={false}>
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_ui_rename_project')}</OGDialogTitle>
        </OGDialogHeader>
        <form id={formId} onSubmit={handleSubmit}>
          <Input
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label={localize('com_ui_project_name')}
            className="w-full bg-transparent text-text-primary placeholder:text-text-secondary focus-visible:ring-2 focus-visible:ring-ring-primary"
          />
        </form>
        <div className="flex justify-end gap-4 pt-4">
          <OGDialogClose asChild>
            <Button aria-label="cancel" variant="outline">
              {localize('com_ui_cancel')}
            </Button>
          </OGDialogClose>
          <Button
            type="submit"
            form={formId}
            variant="submit"
            disabled={!name.trim() || updateProject.isLoading}
          >
            {updateProject.isLoading ? <Spinner className="size-4" /> : localize('com_ui_save')}
          </Button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
