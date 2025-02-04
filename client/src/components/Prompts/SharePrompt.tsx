import React, { useEffect, useMemo } from 'react';
import { Share2Icon } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { Permissions } from 'librechat-data-provider';
import type {
  TPromptGroup,
  TStartupConfig,
  TUpdatePromptGroupPayload,
} from 'librechat-data-provider';
import {
  Button,
  Switch,
  OGDialog,
  OGDialogTitle,
  OGDialogContent,
  OGDialogTrigger,
  OGDialogClose,
} from '~/components/ui';
import { useUpdatePromptGroup, useGetStartupConfig } from '~/data-provider';
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
    () => ((group?.projectIds ?? []) as string[]).includes(instanceProjectId as string),
    [group, instanceProjectId],
  );

  const {
    control,
    setValue,
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

  if (group == null || instanceProjectId == null) {
    return null;
  }

  const onSubmit = (data: FormValues) => {
    const groupId = group._id ?? '';
    if (groupId === '' || instanceProjectId == null) {
      return;
    }

    if (data[Permissions.SHARED_GLOBAL] === true && groupIsGlobal) {
      showToast({
        message: localize('com_ui_prompt_already_shared_to_all'),
        status: 'info',
      });
      return;
    }

    const payload = {} as TUpdatePromptGroupPayload;
    if (data[Permissions.SHARED_GLOBAL] === true) {
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
          aria-label="Share prompt"
          className="h-10 w-10 border border-transparent bg-blue-500/90 p-0.5 transition-all hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-800"
          disabled={disabled}
        >
          <Share2Icon className="size-5 cursor-pointer text-white" />
        </Button>
      </OGDialogTrigger>
      <OGDialogContent className="w-11/12 max-w-lg" role="dialog" aria-labelledby="dialog-title">
        <OGDialogTitle id="dialog-title" className="truncate pr-2" title={group.name}>
          {localize('com_ui_share_var', `"${group.name}"`)}
        </OGDialogTitle>
        <form className="p-2" onSubmit={handleSubmit(onSubmit)} aria-describedby="form-description">
          <div id="form-description" className="sr-only">
            {localize('com_ui_share_form_description')}
          </div>
          <div className="mb-4 flex items-center justify-between gap-2 py-4">
            <div className="flex items-center" id="share-to-all-users">
              {localize('com_ui_share_to_all_users')}
            </div>
            <Controller
              name={Permissions.SHARED_GLOBAL}
              control={control}
              disabled={isFetching === true || updateGroup.isLoading || instanceProjectId == null}
              render={({ field }) => (
                <Switch
                  {...field}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  value={field.value.toString()}
                  aria-labelledby="share-to-all-users"
                />
              )}
            />
          </div>
          <div className="flex justify-end">
            <OGDialogClose asChild>
              <Button
                type="submit"
                disabled={isSubmitting || isFetching}
                variant="submit"
                aria-label={localize('com_ui_save')}
              >
                {localize('com_ui_save')}
              </Button>
            </OGDialogClose>
          </div>
        </form>
      </OGDialogContent>
    </OGDialog>
  );
};

export default SharePrompt;
