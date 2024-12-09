import { useMemo, useEffect } from 'react';
import { ShieldEllipsis } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { Permissions, SystemRoles, roleDefaults, PermissionTypes } from 'librechat-data-provider';
import type { Control, UseFormSetValue, UseFormGetValues } from 'react-hook-form';
import { OGDialog, OGDialogTitle, OGDialogContent, OGDialogTrigger } from '~/components/ui';
import { useUpdatePromptPermissionsMutation } from '~/data-provider';
import { useLocalize, useAuthContext } from '~/hooks';
import { Button, Switch } from '~/components/ui';
import { useToastContext } from '~/Providers';

type FormValues = Record<Permissions, boolean>;

type LabelControllerProps = {
  label: string;
  promptPerm: Permissions;
  control: Control<FormValues, unknown, FormValues>;
  setValue: UseFormSetValue<FormValues>;
  getValues: UseFormGetValues<FormValues>;
};

const defaultValues = roleDefaults[SystemRoles.USER];

const LabelController: React.FC<LabelControllerProps> = ({
  control,
  promptPerm,
  label,
  getValues,
  setValue,
}) => (
  <div className="mb-4 flex items-center justify-between gap-2">
    <button
      className="cursor-pointer select-none"
      type="button"
      // htmlFor={promptPerm}
      onClick={() =>
        setValue(promptPerm, !getValues(promptPerm), {
          shouldDirty: true,
        })
      }
      tabIndex={0}
    >
      {label}
    </button>
    <Controller
      name={promptPerm}
      control={control}
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
);

const AdminSettings = () => {
  const localize = useLocalize();
  const { user, roles } = useAuthContext();
  const { showToast } = useToastContext();
  const { mutate, isLoading } = useUpdatePromptPermissionsMutation({
    onSuccess: () => {
      showToast({ status: 'success', message: localize('com_ui_saved') });
    },
    onError: () => {
      showToast({ status: 'error', message: localize('com_ui_error_save_admin_settings') });
    },
  });

  const {
    reset,
    control,
    setValue,
    getValues,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    mode: 'onChange',
    defaultValues: useMemo(() => {
      if (roles?.[SystemRoles.USER]) {
        return roles[SystemRoles.USER][PermissionTypes.PROMPTS];
      }

      return defaultValues[PermissionTypes.PROMPTS];
    }, [roles]),
  });

  useEffect(() => {
    if (roles?.[SystemRoles.USER]?.[PermissionTypes.PROMPTS]) {
      reset(roles[SystemRoles.USER][PermissionTypes.PROMPTS]);
    }
  }, [roles, reset]);

  if (user?.role !== SystemRoles.ADMIN) {
    return null;
  }

  const labelControllerData = [
    {
      promptPerm: Permissions.SHARED_GLOBAL,
      label: localize('com_ui_prompts_allow_share_global'),
    },
    {
      promptPerm: Permissions.USE,
      label: localize('com_ui_prompts_allow_use'),
    },
    {
      promptPerm: Permissions.CREATE,
      label: localize('com_ui_prompts_allow_create'),
    },
  ];

  const onSubmit = (data: FormValues) => {
    mutate({ roleName: SystemRoles.USER, updates: data });
  };

  return (
    <OGDialog>
      <OGDialogTrigger asChild>
        <Button
          size={'sm'}
          variant={'outline'}
          className="h-10 w-fit gap-1 border transition-all dark:bg-transparent"
        >
          <ShieldEllipsis className="cursor-pointer" />
          <span className="hidden sm:flex">{localize('com_ui_admin')}</span>
        </Button>
      </OGDialogTrigger>
      <OGDialogContent className="w-1/4 border-border-light bg-surface-primary text-text-primary">
        <OGDialogTitle>{`${localize('com_ui_admin_settings')} - ${localize(
          'com_ui_prompts',
        )}`}</OGDialogTitle>
        <form className="p-2" onSubmit={handleSubmit(onSubmit)}>
          <div className="py-5">
            {labelControllerData.map(({ promptPerm, label }) => (
              <LabelController
                key={promptPerm}
                control={control}
                promptPerm={promptPerm}
                label={label}
                getValues={getValues}
                setValue={setValue}
              />
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || isLoading}
              className="btn rounded bg-green-500 font-bold text-white transition-all hover:bg-green-600"
            >
              {localize('com_ui_save')}
            </button>
          </div>
        </form>
      </OGDialogContent>
    </OGDialog>
  );
};

export default AdminSettings;
