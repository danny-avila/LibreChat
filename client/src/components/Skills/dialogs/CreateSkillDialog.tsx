import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import {
  Input,
  Button,
  OGDialog,
  OGDialogContent,
  TextareaAutosize,
  useToastContext,
} from '@librechat/client';
import {
  SKILL_NAME_PATTERN,
  SKILL_NAME_MAX_LENGTH,
  SKILL_DESCRIPTION_MAX_LENGTH,
} from 'librechat-data-provider';
import { useCreateSkillMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface CreateSkillDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  defaultName?: string;
  defaultDescription?: string;
  defaultBody?: string;
}

interface FormValues {
  name: string;
  description: string;
  body: string;
}

/**
 * Minimal create-skill dialog matching Claude.ai's "Write skill instructions"
 * modal: name, description, instructions. No category, no invocation mode.
 */
export default function CreateSkillDialog({
  isOpen,
  setIsOpen,
  defaultName = '',
  defaultDescription = '',
  defaultBody = '',
}: CreateSkillDialogProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();

  const {
    register,
    handleSubmit,
    reset,
    formState: { isValid, isSubmitting, errors },
  } = useForm<FormValues>({
    defaultValues: { name: defaultName, description: defaultDescription, body: defaultBody },
    mode: 'onChange',
  });

  const createSkill = useCreateSkillMutation({
    onSuccess: (skill) => {
      showToast({ status: 'success', message: localize('com_ui_skill_created') });
      setIsOpen(false);
      reset();
      navigate(`/skills/${skill._id}`);
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        localize('com_ui_skill_create_error');
      showToast({ status: 'error', message });
    },
  });

  const onSubmit = (data: FormValues) => {
    if (createSkill.isLoading) {
      return;
    }
    createSkill.mutate({
      name: data.name.trim(),
      description: data.description.trim(),
      body: data.body,
    });
  };

  const handleClose = () => {
    setIsOpen(false);
    reset();
  };

  const submitDisabled = !isValid || isSubmitting || createSkill.isLoading;

  return (
    <OGDialog open={isOpen} onOpenChange={setIsOpen}>
      <OGDialogContent className="w-11/12 max-w-5xl overflow-hidden">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex max-h-[80vh] min-w-0 flex-col gap-3 overflow-hidden p-1 sm:gap-4 sm:p-2"
        >
          <h2 className="text-lg font-bold text-text-primary">
            {localize('com_ui_skill_write_instructions')}
          </h2>

          {/* Skill name */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="create-skill-name" className="text-sm text-text-secondary">
              {localize('com_ui_name')}
            </label>
            <Input
              id="create-skill-name"
              placeholder={localize('com_ui_skill_name_placeholder')}
              aria-invalid={errors.name ? 'true' : 'false'}
              className="border-border-medium"
              autoComplete="off"
              {...register('name', {
                required: localize('com_ui_skill_name_required'),
                pattern: {
                  value: SKILL_NAME_PATTERN,
                  message: localize('com_ui_skill_name_invalid'),
                },
                maxLength: {
                  value: SKILL_NAME_MAX_LENGTH,
                  message: localize('com_ui_skill_name_too_long', {
                    0: String(SKILL_NAME_MAX_LENGTH),
                  }),
                },
              })}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="create-skill-description" className="text-sm text-text-secondary">
              {localize('com_ui_description')}
            </label>
            <TextareaAutosize
              id="create-skill-description"
              minRows={2}
              maxRows={4}
              placeholder={localize('com_ui_skill_description_placeholder')}
              aria-label={localize('com_ui_description')}
              className="w-full resize-none rounded-lg border border-border-medium bg-transparent p-3 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
              {...register('description', {
                required: localize('com_ui_skill_description_required'),
                maxLength: {
                  value: SKILL_DESCRIPTION_MAX_LENGTH,
                  message: localize('com_ui_skill_description_too_long', {
                    0: String(SKILL_DESCRIPTION_MAX_LENGTH),
                  }),
                },
              })}
            />
          </div>

          {/* Instructions (body) */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="create-skill-body" className="text-sm text-text-secondary">
              {localize('com_ui_skill_instructions')}
            </label>
            <TextareaAutosize
              id="create-skill-body"
              minRows={6}
              maxRows={12}
              placeholder={localize('com_ui_skill_instructions_placeholder')}
              aria-label={localize('com_ui_skill_instructions')}
              className="w-full resize-none rounded-lg border border-border-medium bg-transparent p-3 font-mono text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
              {...register('body')}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              {localize('com_ui_cancel')}
            </Button>
            <Button
              type="submit"
              disabled={submitDisabled}
              className={cn(submitDisabled && 'opacity-50')}
            >
              {localize('com_ui_create')}
            </Button>
          </div>
        </form>
      </OGDialogContent>
    </OGDialog>
  );
}
