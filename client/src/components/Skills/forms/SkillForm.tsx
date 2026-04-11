import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import {
  Button,
  Input,
  TextareaAutosize,
  Label,
  Skeleton,
  useToastContext,
} from '@librechat/client';
import { AlertTriangle, Info } from 'lucide-react';
import { ResourceType, PermissionBits, SystemRoles } from 'librechat-data-provider';
import type { TSkill, TUpdateSkillPayload, TSkillWarning } from 'librechat-data-provider';
import { useUpdateSkillMutation, useGetSkillQuery } from '~/data-provider';
import { useResourcePermissions, useLocalize, useAuthContext } from '~/hooks';
import { ShareSkill } from '../buttons';
import DeleteSkill from '../dialogs/DeleteSkill';
import { cn } from '~/utils';

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface SkillFormValues {
  name: string;
  description: string;
  body: string;
}

interface SkillFormProps {
  skillId: string;
}

function toValues(skill: TSkill | undefined): SkillFormValues | undefined {
  if (!skill) {
    return undefined;
  }
  return {
    name: skill.name,
    description: skill.description,
    body: skill.body ?? '',
  };
}

export default function SkillForm({ skillId }: SkillFormProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const [warnings, setWarnings] = useState<TSkillWarning[] | null>(null);

  const skillQuery = useGetSkillQuery(skillId);
  const skill = skillQuery.data;

  const { hasPermission, isLoading: permissionsLoading } = useResourcePermissions(
    ResourceType.SKILL,
    skillId,
  );
  const isOwner = skill?.author === user?.id;
  const isAdmin = user?.role === SystemRoles.ADMIN;
  const canEdit = useMemo(() => {
    if (isOwner || isAdmin) {
      return true;
    }
    return hasPermission(PermissionBits.EDIT);
  }, [hasPermission, isAdmin, isOwner]);
  const canDelete = isOwner || isAdmin;

  const values = useMemo(() => toValues(skill), [skill]);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { isDirty, isValid, isSubmitting, errors },
  } = useForm<SkillFormValues>({
    defaultValues: { name: '', description: '', body: '' },
    values,
    mode: 'onChange',
  });

  useEffect(() => {
    setWarnings(null);
  }, [skillId]);

  const updateSkill = useUpdateSkillMutation({
    onSuccess: (updated) => {
      showToast({
        status: updated.warnings && updated.warnings.length > 0 ? 'warning' : 'success',
        message: localize('com_ui_skill_updated'),
      });
      setWarnings(updated.warnings ?? null);
      reset(toValues(updated));
    },
    onError: (error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        showToast({ status: 'warning', message: localize('com_ui_skill_update_conflict') });
        skillQuery.refetch();
        return;
      }
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        localize('com_ui_skill_update_error');
      showToast({ status: 'error', message });
    },
  });

  const onSubmit = useCallback(
    (data: SkillFormValues) => {
      if (!skill) {
        return;
      }
      const trimmedName = data.name.trim();
      if (!SKILL_NAME_PATTERN.test(trimmedName)) {
        setError('name', { message: localize('com_ui_skill_name_invalid') });
        return;
      }
      const payload: TUpdateSkillPayload = {
        name: trimmedName,
        description: data.description.trim(),
        body: data.body,
      };
      updateSkill.mutate({
        id: skill._id,
        expectedVersion: skill.version,
        payload,
      });
    },
    [localize, setError, skill, updateSkill],
  );

  if (skillQuery.isLoading || permissionsLoading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (skillQuery.isError || !skill) {
    return null;
  }

  const readOnly = !canEdit;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6"
      aria-label={localize('com_ui_skill_edit_title')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-text-primary">{skill.name}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {localize('com_ui_skill_version', { 0: String(skill.version) })}
            {' · '}
            {skill.authorName}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ShareSkill skill={skill} />
          {canDelete && (
            <DeleteSkill
              skillId={skill._id}
              skillName={skill.name}
              onDelete={() => navigate('/skills', { replace: true })}
            />
          )}
        </div>
      </div>

      {readOnly && (
        <div
          role="note"
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-600 dark:text-amber-400"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{localize('com_ui_skill_no_edit_permission')}</span>
        </div>
      )}

      {warnings && warnings.length > 0 && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-600 dark:text-amber-400"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" aria-hidden="true" />
            {localize('com_ui_skill_warnings')}
          </div>
          <ul className="ml-6 list-disc">
            {warnings.map((w) => (
              <li key={`${w.field}:${w.code}`}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

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
              readOnly={readOnly}
              aria-invalid={errors.name ? 'true' : 'false'}
              aria-describedby={errors.name ? 'skill-name-error' : undefined}
              className="border-border-medium"
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
              readOnly={readOnly}
              minRows={2}
              maxRows={6}
              aria-label={localize('com_ui_description')}
              aria-invalid={errors.description ? 'true' : 'false'}
              className="w-full resize-none rounded-xl border border-border-medium bg-transparent p-3 text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            />
          )}
        />
        <p className="text-xs text-text-tertiary">{localize('com_ui_skill_description_help')}</p>
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
              readOnly={readOnly}
              minRows={10}
              maxRows={24}
              aria-label={localize('com_ui_skill_body')}
              className="w-full resize-none rounded-xl border border-border-medium bg-transparent p-3 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            />
          )}
        />
      </div>

      {!readOnly && (
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => reset(values)}
            aria-disabled={!isDirty || undefined}
            className={cn(!isDirty && 'opacity-50')}
          >
            {localize('com_ui_reset')}
          </Button>
          <Button
            type="submit"
            aria-disabled={
              !isDirty || !isValid || isSubmitting || updateSkill.isLoading || undefined
            }
            className={cn(
              (!isDirty || !isValid || isSubmitting || updateSkill.isLoading) && 'opacity-50',
            )}
          >
            {localize('com_ui_save')}
          </Button>
        </div>
      )}
    </form>
  );
}
