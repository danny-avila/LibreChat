import { useMemo, useEffect, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { ShieldEllipsis } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { Permissions, SystemRoles, roleDefaults, PermissionTypes } from 'librechat-data-provider';
import {
  Button,
  Switch,
  OGDialog,
  DropdownPopup,
  OGDialogTitle,
  OGDialogContent,
  OGDialogTrigger,
  useToastContext,
} from '@librechat/client';
import type { Control, UseFormSetValue, UseFormGetValues } from 'react-hook-form';
import { useUpdatePeoplePickerPermissionsMutation } from '~/data-provider';
import { useLocalize, useAuthContext } from '~/hooks';

type FormValues = {
  [Permissions.VIEW_USERS]: boolean;
  [Permissions.VIEW_GROUPS]: boolean;
  [Permissions.VIEW_ROLES]: boolean;
};

type LabelControllerProps = {
  label: string;
  peoplePickerPerm: Permissions.VIEW_USERS | Permissions.VIEW_GROUPS | Permissions.VIEW_ROLES;
  control: Control<FormValues, unknown, FormValues>;
  setValue: UseFormSetValue<FormValues>;
  getValues: UseFormGetValues<FormValues>;
};

const LabelController: React.FC<LabelControllerProps> = ({
  control,
  peoplePickerPerm,
  label,
  getValues,
  setValue,
}) => (
  <div className="mb-4 flex items-center justify-between gap-2">
    <button
      className="cursor-pointer select-none"
      type="button"
      onClick={() =>
        setValue(peoplePickerPerm, !getValues(peoplePickerPerm), {
          shouldDirty: true,
        })
      }
      tabIndex={0}
    >
      {label}
    </button>
    <Controller
      name={peoplePickerPerm}
      control={control}
      render={({ field }) => (
        <Switch
          {...field}
          checked={field.value ?? false}
          onCheckedChange={field.onChange}
          value={(field.value ?? false).toString()}
          aria-label={label}
        />
      )}
    />
  </div>
);

const PeoplePickerAdminSettings = () => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { user, roles } = useAuthContext();
  const { mutate, isLoading } = useUpdatePeoplePickerPermissionsMutation({
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
    const rolePerms = roles?.[selectedRole]?.permissions;
    if (rolePerms) {
      return rolePerms[PermissionTypes.PEOPLE_PICKER];
    }
    return roleDefaults[selectedRole].permissions[PermissionTypes.PEOPLE_PICKER];
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
    const value = roles?.[selectedRole]?.permissions?.[PermissionTypes.PEOPLE_PICKER];
    if (value) {
      reset(value);
    } else {
      reset(roleDefaults[selectedRole].permissions[PermissionTypes.PEOPLE_PICKER]);
    }
  }, [roles, selectedRole, reset]);

  if (user?.role !== SystemRoles.ADMIN) {
    return null;
  }

  const labelControllerData: {
    peoplePickerPerm: Permissions.VIEW_USERS | Permissions.VIEW_GROUPS | Permissions.VIEW_ROLES;
    label: string;
  }[] = [
    {
      peoplePickerPerm: Permissions.VIEW_USERS,
      label: localize('com_ui_people_picker_allow_view_users'),
    },
    {
      peoplePickerPerm: Permissions.VIEW_GROUPS,
      label: localize('com_ui_people_picker_allow_view_groups'),
    },
    {
      peoplePickerPerm: Permissions.VIEW_ROLES,
      label: localize('com_ui_people_picker_allow_view_roles'),
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
          variant={'outline'}
          className="btn btn-neutral border-token-border-light relative gap-1 rounded-lg font-medium"
          aria-label={localize('com_ui_admin_settings')}
        >
          <ShieldEllipsis className="cursor-pointer" aria-hidden="true" />
          {localize('com_ui_admin_settings')}
        </Button>
      </OGDialogTrigger>
      <OGDialogContent className="w-full border-border-light bg-surface-primary text-text-primary lg:w-1/4">
        <OGDialogTitle>
          {localize('com_ui_admin_settings_section', { section: localize('com_ui_people_picker') })}
        </OGDialogTitle>
        <div className="p-2">
          {/* Role selection dropdown */}
          <div className="flex items-center gap-2">
            <span className="font-medium">{localize('com_ui_role_select')}:</span>
            <DropdownPopup
              unmountOnHide={true}
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
              {labelControllerData.map(({ peoplePickerPerm, label }) => (
                <div key={peoplePickerPerm}>
                  <LabelController
                    control={control}
                    peoplePickerPerm={peoplePickerPerm}
                    label={label}
                    getValues={getValues}
                    setValue={setValue}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSubmit(onSubmit)}
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

export default PeoplePickerAdminSettings;
