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

    if (data[Permissions.SHARED_GLOBAL] && groupIsGlobal) {
      showToast({
        message: localize('com_ui_prompt_already_shared_to_all'),
        status: 'info',
      });
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
          variant="default"
          size="sm"
          className="h-10 w-10 border border-transparent bg-blue-500/90 p-0.5 transition-all hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-800"
          disabled={disabled}
        >
          <Share2Icon className="size-5 cursor-pointer text-white" />
        </Button>
      </OGDialogTrigger>
      <OGDialogContent className="w-11/12 max-w-lg">
        <OGDialogTitle className="truncate pr-2" title={group.name}>
          {localize('com_ui_share_var', `"${group.name}"`)}
        </OGDialogTitle>
        <form className="p-2" onSubmit={handleSubmit(onSubmit)}>
          <div className="mb-4 flex items-center justify-between gap-2 py-4">
            <div className="flex items-center">{localize('com_ui_share_to_all_users')}</div>
            <Controller
              name={Permissions.SHARED_GLOBAL}
              control={control}
              disabled={isFetching || updateGroup.isLoading || !instanceProjectId}
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
                className="btn rounded bg-green-500 font-bold text-white transition-all hover:bg-green-600"
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
