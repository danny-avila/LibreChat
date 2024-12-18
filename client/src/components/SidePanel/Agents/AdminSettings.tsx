import * as Ariakit from '@ariakit/react';
import { useMemo, useEffect, useState } from 'react';
import { ShieldEllipsis } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { Permissions, SystemRoles, roleDefaults, PermissionTypes } from 'librechat-data-provider';
import type { Control, UseFormSetValue, UseFormGetValues } from 'react-hook-form';
import { OGDialog, OGDialogTitle, OGDialogContent, OGDialogTrigger } from '~/components/ui';
import { useUpdateAgentPermissionsMutation } from '~/data-provider';
import { Button, Switch, DropdownPopup } from '~/components/ui';
import { useLocalize, useAuthContext } from '~/hooks';
import { useToastContext } from '~/Providers';

type FormValues = Record<Permissions, boolean>;

type LabelControllerProps = {
  label: string;
  agentPerm: Permissions;
  control: Control<FormValues, unknown, FormValues>;
  setValue: UseFormSetValue<FormValues>;
  getValues: UseFormGetValues<FormValues>;
};

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

  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<SystemRoles>(SystemRoles.USER);

  const defaultValues = useMemo(() => {
    if (roles?.[selectedRole]) {
      return roles[selectedRole][PermissionTypes.AGENTS];
    }
    return roleDefaults[selectedRole][PermissionTypes.AGENTS];
  }, [roles, selectedRole]);

  const {
    reset,
    control,
    setValue,
    getValues,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    mode: 'onChange',
    defaultValues,
  });

  useEffect(() => {
    if (roles?.[selectedRole]?.[PermissionTypes.AGENTS]) {
      reset(roles[selectedRole][PermissionTypes.AGENTS]);
    } else {
      reset(roleDefaults[selectedRole][PermissionTypes.AGENTS]);
    }
  }, [roles, selectedRole, reset]);

  if (user?.role !== SystemRoles.ADMIN) {
    return null;
  }

  const labelControllerData = [
    {
      agentPerm: Permissions.SHARED_GLOBAL,
      label: localize('com_ui_agents_allow_share_global'),
    },
    {
      agentPerm: Permissions.CREATE,
      label: localize('com_ui_agents_allow_create'),
    },
    {
      agentPerm: Permissions.USE,
      label: localize('com_ui_agents_allow_use'),
    },
  ];

  const onSubmit = (data: FormValues) => {
    mutate({ roleName: selectedRole, updates: data });
  };

  const roleDropdownItems = [
    {
      label: SystemRoles.USER,
      onClick: () => {
        setSelectedRole(SystemRoles.USER);
      },
    },
    {
      label: SystemRoles.ADMIN,
      onClick: () => {
        setSelectedRole(SystemRoles.ADMIN);
      },
    },
  ];

  return (
    <OGDialog>
      <OGDialogTrigger asChild>
        <Button
          size={'sm'}
          variant={'outline'}
          className="btn btn-neutral border-token-border-light relative mb-4 h-9 w-full gap-1 rounded-lg font-medium"
        >
          <ShieldEllipsis className="cursor-pointer" />
          {localize('com_ui_admin_settings')}
        </Button>
      </OGDialogTrigger>
      <OGDialogContent className="w-1/4 border-border-light bg-surface-primary text-text-primary">
        <OGDialogTitle>{`${localize('com_ui_admin_settings')} - ${localize(
          'com_ui_agents',
        )}`}</OGDialogTitle>
        <div className="p-2">
          {/* Role selection dropdown */}
          <div className="flex items-center gap-2">
            <span className="font-medium">{localize('com_ui_role_select')}:</span>
            <DropdownPopup
              menuId="role-dropdown"
              isOpen={isRoleMenuOpen}
              setIsOpen={setIsRoleMenuOpen}
              trigger={
                <Ariakit.MenuButton className="inline-flex w-1/4 items-center justify-center rounded-lg border border-border-light bg-transparent px-2 py-1 text-text-primary transition-all ease-in-out hover:bg-surface-tertiary">
                  {selectedRole}
                </Ariakit.MenuButton>
              }
              items={roleDropdownItems}
              itemClassName="items-center justify-center"
              sameWidth={true}
            />
          </div>
          {/* Permissions form */}
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="py-5">
              {labelControllerData.map(({ agentPerm, label }) => (
                <div key={agentPerm}>
                  <LabelController
                    control={control}
                    agentPerm={agentPerm}
                    label={label}
                    getValues={getValues}
                    setValue={setValue}
                  />
                  {selectedRole === SystemRoles.ADMIN && agentPerm === Permissions.USE && (
                    <>
                      <div className="mb-2 max-w-full whitespace-normal break-words text-sm text-red-600">
                        <span>{localize('com_ui_admin_access_warning')}</span>
                        {'\n'}
                        <a
                          href="https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/interface"
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-500 underline"
                        >
                          {localize('com_ui_more_info')}
                        </a>
                      </div>
                    </>
                  )}
                </div>
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
        </div>
      </OGDialogContent>
    </OGDialog>
  );
};

export default AdminSettings;
