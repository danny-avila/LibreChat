import { useEffect, useId, useRef } from 'react';
import { Info } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { MAX_CHAT_PROJECT_INSTRUCTIONS_LENGTH } from 'librechat-data-provider';
import {
  Button,
  Label,
  OGDialog,
  OGDialogTemplate,
  Spinner,
  Textarea,
  TooltipAnchor,
  useToastContext,
} from '@librechat/client';
import type { TChatProject } from 'librechat-data-provider';
import type { RefObject } from 'react';
import { useUpdateProjectMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';

type ProjectInstructionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: TChatProject;
  triggerRef?: RefObject<HTMLButtonElement | null>;
};

type InstructionsForm = {
  instructions: string;
};

export default function ProjectInstructionsDialog({
  open,
  onOpenChange,
  project,
  triggerRef,
}: ProjectInstructionsDialogProps) {
  const localize = useLocalize();
  const formId = useId();
  const updateProject = useUpdateProjectMutation();
  const { showToast } = useToastContext();
  const dialogSessionRef = useRef(0);
  const wasOpenRef = useRef(open);
  const { register, handleSubmit, reset, watch, setFocus } = useForm<InstructionsForm>({
    defaultValues: { instructions: project.instructions ?? '' },
  });
  const instructions = watch('instructions');
  const isBusy = updateProject.isLoading;
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      dialogSessionRef.current += 1;
    }
    wasOpenRef.current = open;
    if (open) {
      reset({ instructions: project.instructions ?? '' });
    }
  }, [open, project.instructions, reset]);

  const onSubmit = ({ instructions: value }: InstructionsForm) => {
    if (isBusy) {
      return;
    }

    const submittedSession = dialogSessionRef.current;
    updateProject.mutate(
      { projectId: project._id, instructions: value.trim() },
      {
        onSuccess: () => {
          if (dialogSessionRef.current === submittedSession) {
            onOpenChange(false);
          }
        },
        onError: () => {
          showToast({
            message: localize('com_ui_project_instructions_error'),
            severity: NotificationSeverity.ERROR,
            showIcon: true,
          });
        },
      },
    );
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isBusy) {
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <OGDialog open={open} onOpenChange={handleOpenChange} triggerRef={triggerRef}>
      <OGDialogTemplate
        title={localize('com_ui_project_instructions')}
        showCloseButton={false}
        cancelDisabled={isBusy}
        className="w-11/12 max-w-3xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          setFocus('instructions');
        }}
        onCloseAutoFocus={(event) => {
          if (triggerRef?.current) {
            event.preventDefault();
            triggerRef.current.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (isBusy) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (isBusy) {
            event.preventDefault();
          }
        }}
        main={
          <form
            id={formId}
            onSubmit={handleSubmit(onSubmit)}
            aria-busy={isBusy}
            className="flex flex-col gap-3"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label
                  htmlFor={`${formId}-instructions`}
                  className="text-sm font-medium text-text-primary"
                >
                  {localize('com_ui_project_instructions_label')}
                </Label>
                <TooltipAnchor
                  description={localize('com_ui_project_instructions_help')}
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="relative size-7 text-text-secondary after:absolute after:-inset-1.5"
                      aria-label={localize('com_ui_project_instructions_info')}
                      disabled={isBusy}
                    >
                      <Info className="size-3.5" aria-hidden="true" />
                    </Button>
                  }
                />
              </div>
              <Textarea
                id={`${formId}-instructions`}
                rows={18}
                maxLength={MAX_CHAT_PROJECT_INSTRUCTIONS_LENGTH}
                aria-describedby={`${formId}-instructions-help`}
                className="h-[clamp(12rem,50dvh,32rem)] bg-transparent text-base leading-relaxed [overflow-wrap:anywhere]"
                readOnly={isBusy}
                {...register('instructions')}
              />
              <p id={`${formId}-instructions-help`} className="sr-only">
                {localize('com_ui_project_instructions_help')}
              </p>
              <p className="text-right text-xs tabular-nums text-text-tertiary" aria-live="polite">
                {instructions.length}/{MAX_CHAT_PROJECT_INSTRUCTIONS_LENGTH}
              </p>
            </div>
          </form>
        }
        buttons={
          <Button
            type="submit"
            form={formId}
            variant="submit"
            disabled={isBusy}
            aria-label={isBusy ? localize('com_ui_saving') : localize('com_ui_save')}
          >
            {isBusy ? <Spinner className="size-4" aria-hidden="true" /> : localize('com_ui_save')}
          </Button>
        }
      />
    </OGDialog>
  );
}
