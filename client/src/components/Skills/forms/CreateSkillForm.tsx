import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { Button, Input, TextareaAutosize, useToastContext, Label } from '@librechat/client';
import { AlertTriangle } from 'lucide-react';
import type { TCreateSkill, TSkill, TSkillWarning } from 'librechat-data-provider';
import { useCreateSkillMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_BODY = `# Overview

Describe what this skill does and how it should be applied.

## When to use

- List concrete signals that should trigger this skill
- Add examples that make the trigger unambiguous

## How to apply

Walk through the steps the agent should take.
`;

interface CreateSkillFormValues {
  name: string;
  description: string;
  body: string;
}

const DEFAULT_VALUES: CreateSkillFormValues = {
  name: '',
  description: '',
  body: DEFAULT_BODY,
};

interface CreateSkillFormProps {
  onCancel?: () => void;
  onSuccess?: (skill: TSkill) => void;
}

export default function CreateSkillForm({ onCancel, onSuccess }: CreateSkillFormProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, isValid, errors },
  } = useForm<CreateSkillFormValues>({
    defaultValues: DEFAULT_VALUES,
    mode: 'onChange',
  });

  const createSkill = useCreateSkillMutation({
    onSuccess: (skill) => {
      const warnings: TSkillWarning[] | undefined = skill.warnings;
      showToast({
        status: warnings && warnings.length > 0 ? 'warning' : 'success',
        message: localize('com_ui_skill_created'),
      });
      if (onSuccess) {
        onSuccess(skill);
      } else {
        navigate(`/skills/${skill._id}`);
      }
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        localize('com_ui_skill_create_error');
      showToast({ status: 'error', message });
    },
  });

  const onSubmit = useCallback(
    (values: CreateSkillFormValues) => {
      const payload: TCreateSkill = {
        name: values.name.trim(),
        description: values.description.trim(),
        body: values.body,
      };

      if (!SKILL_NAME_PATTERN.test(payload.name)) {
        setError('name', { message: localize('com_ui_skill_name_invalid') });
        return;
      }

      createSkill.mutate(payload);
    },
    [createSkill, localize, setError],
  );

  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    } else {
      navigate(-1);
    }
  }, [navigate, onCancel]);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6"
      aria-label={localize('com_ui_skill_create_title')}
    >
      <div>
        <h1 className="text-xl font-semibold text-text-primary">
          {localize('com_ui_skill_create_title')}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {localize('com_ui_skill_description_help')}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="skill-name">
          {localize('com_ui_name')} <span className="text-red-500">*</span>
        </Label>
        <Controller
          name="name"
          control={control}
          rules={{
            required: localize('com_ui_skill_name_required'),
            pattern: {
              value: SKILL_NAME_PATTERN,
              message: localize('com_ui_skill_name_invalid'),
            },
            maxLength: { value: 64, message: localize('com_ui_skill_name_invalid') },
          }}
          render={({ field }) => (
            <Input
              {...field}
              id="skill-name"
              placeholder={localize('com_ui_skill_name_placeholder')}
              aria-invalid={errors.name ? 'true' : 'false'}
              aria-describedby={errors.name ? 'skill-name-error' : undefined}
              className="border-border-medium"
              autoComplete="off"
            />
          )}
        />
        {errors.name && (
          <p id="skill-name-error" className="text-sm text-red-500" role="alert">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="skill-description">
          {localize('com_ui_description')} <span className="text-red-500">*</span>
        </Label>
        <Controller
          name="description"
          control={control}
          rules={{
            required: localize('com_ui_skill_description_required'),
            maxLength: { value: 1024, message: localize('com_ui_skill_description_required') },
          }}
          render={({ field }) => (
            <TextareaAutosize
              {...field}
              id="skill-description"
              minRows={2}
              maxRows={6}
              placeholder={localize('com_ui_skill_description_placeholder')}
              aria-label={localize('com_ui_description')}
              aria-invalid={errors.description ? 'true' : 'false'}
              aria-describedby={errors.description ? 'skill-description-error' : undefined}
              className="w-full resize-none rounded-xl border border-border-medium bg-transparent p-3 text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            />
          )}
        />
        <p className="text-xs text-text-tertiary">{localize('com_ui_skill_description_help')}</p>
        {errors.description && (
          <p id="skill-description-error" className="text-sm text-red-500" role="alert">
            {errors.description.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="skill-body">{localize('com_ui_skill_body')}</Label>
        <Controller
          name="body"
          control={control}
          render={({ field }) => (
            <TextareaAutosize
              {...field}
              id="skill-body"
              minRows={8}
              maxRows={20}
              placeholder={localize('com_ui_skill_body_placeholder')}
              aria-label={localize('com_ui_skill_body')}
              className="w-full resize-none rounded-xl border border-border-medium bg-transparent p-3 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            />
          )}
        />
      </div>

      {createSkill.error != null && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-500"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{localize('com_ui_skill_create_error')}</span>
        </div>
      )}

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={handleCancel}>
          {localize('com_ui_cancel')}
        </Button>
        <Button
          type="submit"
          aria-disabled={!isValid || isSubmitting || createSkill.isLoading || undefined}
          className={cn((!isValid || isSubmitting || createSkill.isLoading) && 'opacity-50')}
        >
          {localize('com_ui_create')}
        </Button>
      </div>
    </form>
  );
}
