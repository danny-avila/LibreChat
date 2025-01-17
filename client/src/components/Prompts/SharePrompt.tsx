import React, { useEffect, useMemo } from 'react';
import { Share2Icon } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { Permissions } from 'librechat-data-provider';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import type {
  TPromptGroup,
  TStartupConfig,
  TUpdatePromptGroupPayload,
} from 'librechat-data-provider';
import {
  OGDialog,
  OGDialogTitle,
  OGDialogContent,
  OGDialogTrigger,
  OGDialogClose,
} from '~/components/ui';
import { useUpdatePromptGroup } from '~/data-provider';
import { Button, Switch } from '~/components/ui';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';

type FormValues = {
  [Permissions.SHARED_GLOBAL]: boolean;
};

const SharePrompt = ({ group, disabled }: { group?: TPromptGroup; disabled: boolean }) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const updateGroup = useUpdatePromptGroup();
  const { data: startupConfig = {} as TStartupConfig, isFetching } = useGetStartupConfig();
  const { instanceProjectId } = startupConfig;
  const groupIsGlobal = useMemo(
    () => !!(group?.projectIds ?? []).includes(instanceProjectId),
    [group, instanceProjectId],
  );

  const {
    control,
    setValue,
    getValues,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    mode: 'onChange',
    defaultValues: {
      [Permissions.SHARED_GLOBAL]: groupIsGlobal,
    },
  });

  useEffect(() => {
    setValue(Permissions.SHARED_GLOBAL, groupIsGlobal);
  }, [groupIsGlobal, setValue]);

  if (!group || !instanceProjectId) {
    return null;
  }

  const onSubmit = (data: FormValues) => {
    const groupId = group._id ?? '';
    if (!groupId || !instanceProjectId) {
      return;
    }

    const payload = {} as TUpdatePromptGroupPayload;

    if (data[Permissions.SHARED_GLOBAL]) {
      payload.projectIds = [startupConfig.instanceProjectId];
    } else {
      payload.removeProjectIds = [startupConfig.instanceProjectId];
    }

    updateGroup.mutate({
      id: groupId,
      payload,
    });
  };

  return (
    <OGDialog>
      <OGDialogTrigger asChild>
        <Button
          variant={'default'}
          size={'sm'}
          className="h-10 w-10 border border-transparent bg-blue-500/90 transition-all hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-800"
          disabled={disabled}
        >
          <Share2Icon className="cursor-pointer text-white " />
        </Button>
      </OGDialogTrigger>
      <OGDialogContent className="border-border-light bg-surface-primary-alt text-text-secondary">
        <OGDialogTitle>{localize('com_ui_share_var', `"${group.name}"`)}</OGDialogTitle>
        <form className="p-2" onSubmit={handleSubmit(onSubmit)}>
          <div className="mb-4 flex items-center justify-between gap-2 py-4">
            <div className="flex items-center">
              <button
                type="button"
                className="mr-2 cursor-pointer"
                onClick={() =>
                  setValue(Permissions.SHARED_GLOBAL, !getValues(Permissions.SHARED_GLOBAL), {
                    shouldDirty: true,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setValue(Permissions.SHARED_GLOBAL, !getValues(Permissions.SHARED_GLOBAL), {
                      shouldDirty: true,
                    });
                  }
                }}
                aria-checked={getValues(Permissions.SHARED_GLOBAL)}
                role="checkbox"
              >
                {localize('com_ui_share_to_all_users')}
              </button>
              <label htmlFor={Permissions.SHARED_GLOBAL} className="select-none">
                {groupIsGlobal && (
                  <span className="ml-2 text-xs">{localize('com_ui_prompt_shared_to_all')}</span>
                )}
              </label>
            </div>
            <Controller
              name={Permissions.SHARED_GLOBAL}
              control={control}
              disabled={isFetching || updateGroup.isLoading || !instanceProjectId}
              rules={{
                validate: (value) => {
                  const isValid = !(value && groupIsGlobal);
                  if (!isValid) {
                    showToast({
                      message: localize('com_ui_prompt_already_shared_to_all'),
                      status: 'warning',
                    });
                  }
                  return isValid;
                },
              }}
              render={({ field }) => (
                <Switch
                  {...field}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  value={field.value.toString()}
                />
              )}
            />
          </div>
          <div className="flex justify-end">
            <OGDialogClose asChild>
              <button
                type="submit"
                disabled={isSubmitting || isFetching}
                className="btn rounded bg-brand-blue-500 font-bold text-white transition-all hover:bg-brand-blue-600"
              >
                {localize('com_ui_save')}
              </button>
            </OGDialogClose>
          </div>
        </form>
      </OGDialogContent>
    </OGDialog>
  );
};

export default SharePrompt;
