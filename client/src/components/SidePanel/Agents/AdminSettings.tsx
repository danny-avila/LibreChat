import { useMemo, useEffect } from 'react';
import { ShieldEllipsis } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { Permissions, SystemRoles, roleDefaults, PermissionTypes } from 'librechat-data-provider';
import type { Control, UseFormSetValue, UseFormGetValues } from 'react-hook-form';
import { OGDialog, OGDialogTitle, OGDialogContent, OGDialogTrigger } from '~/components/ui';
import { useUpdateAgentPermissionsMutation } from '~/data-provider';
import { useLocalize, useAuthContext } from '~/hooks';
import { Button, Switch } from '~/components/ui';
import { useToastContext } from '~/Providers';

type FormValues = Record<Permissions, boolean>;

type LabelControllerProps = {
  label: string;
  agentPerm: Permissions;
  control: Control<FormValues, unknown, FormValues>;
  setValue: UseFormSetValue<FormValues>;
  getValues: UseFormGetValues<FormValues>;
};

const defaultValues = roleDefaults[SystemRoles.USER];

const LabelController: React.FC<LabelControllerProps> = ({
  control,
  agentPerm,
  label,
  getValues,
  setValue,
}) => (
  <div className="mb-4 flex items-center justify-between gap-2">
    <button
      className="cursor-pointer select-none"
      type="button"
      onClick={() =>
        setValue(agentPerm, !getValues(agentPerm), {
          shouldDirty: true,
        })
      }
      tabIndex={0}
    >
      {label}
    </button>
    <Controller
      name={agentPerm}
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
  const { mutate, isLoading } = useUpdateAgentPermissionsMutation({
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
        return roles[SystemRoles.USER][PermissionTypes.AGENTS];
      }

      return defaultValues[PermissionTypes.AGENTS];
    }, [roles]),
  });

  useEffect(() => {
    if (roles?.[SystemRoles.USER]?.[PermissionTypes.AGENTS]) {
      reset(roles[SystemRoles.USER][PermissionTypes.AGENTS]);
    }
  }, [roles, reset]);

  if (user?.role !== SystemRoles.ADMIN) {
    return null;
  }

  const labelControllerData = [
    {
      agentPerm: Permissions.SHARED_GLOBAL,
      label: localize('com_ui_agents_allow_share_global'),
    },
    {
      agentPerm: Permissions.USE,
      label: localize('com_ui_agents_allow_use'),
    },
    {
      agentPerm: Permissions.CREATE,
      label: localize('com_ui_agents_allow_create'),
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
          className="btn btn-neutral border-token-border-light relative my-1 h-9 w-full rounded-lg font-medium"
        >
          <ShieldEllipsis className="cursor-pointer" />
          {localize('com_ui_admin_settings')}
        </Button>
      </OGDialogTrigger>
      <OGDialogContent className="w-1/4 bg-white dark:border-gray-700 dark:bg-gray-850 dark:text-gray-300">
        <OGDialogTitle>{`${localize('com_ui_admin_settings')} - ${localize(
          'com_ui_agents',
        )}`}</OGDialogTitle>
        <form className="p-2" onSubmit={handleSubmit(onSubmit)}>
          <div className="py-5">
            {labelControllerData.map(({ agentPerm, label }) => (
              <LabelController
                key={agentPerm}
                control={control}
                agentPerm={agentPerm}
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
