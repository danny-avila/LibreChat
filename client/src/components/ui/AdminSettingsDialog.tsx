import { useMemo, useEffect, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { ShieldEllipsis } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { Permissions, SystemRoles, roleDefaults, PermissionTypes } from 'librechat-data-provider';
import {
  OGDialog,
  OGDialogTitle,
  OGDialogContent,
  OGDialogTrigger,
  Button,
  Switch,
  DropdownPopup,
} from '@librechat/client';
import type { Control, UseFormSetValue, UseFormGetValues } from 'react-hook-form';
import type { TranslationKeys } from '~/hooks/useLocalize';
import { useLocalize, useAuthContext } from '~/hooks';

type FormValues = Record<Permissions, boolean>;

export interface PermissionConfig {
  permission: Permissions;
  labelKey: TranslationKeys;
}

export interface AdminSettingsDialogProps {
  /** The permission type from PermissionTypes enum */
  permissionType: PermissionTypes;
  /** Localization key for the section name (e.g., 'com_ui_memories', 'com_ui_agents') */
  sectionKey: TranslationKeys;
  /** Array of permission configurations to display */
  permissions: PermissionConfig[];
  /** Unique ID for the role dropdown menu */
  menuId: string;
  /** Mutation function and loading state from the permission update hook */
  mutation: {
    mutate: (data: { roleName: SystemRoles; updates: Record<Permissions, boolean> }) => void;
    isLoading: boolean;
  };
  /** Whether to show the admin access warning when ADMIN role and USE permission is displayed (default: true) */
  showAdminWarning?: boolean;
  /** Custom trigger element. If not provided, uses default button with icon and text */
  trigger?: React.ReactNode;
  /** Additional className for the dialog content */
  dialogContentClassName?: string;
  /** Custom callback when a permission change requires confirmation */
  onPermissionConfirm?: (
    permission: Permissions,
    newValue: boolean,
    onChange: (value: boolean) => void,
  ) => void;
  /** Permissions that require confirmation before changing (only applies when onPermissionConfirm is provided) */
  confirmPermissions?: Permissions[];
  /** Custom content to render after the permissions form (e.g., confirmation dialogs) */
  extraContent?: React.ReactNode;
}

type LabelControllerProps = {
  label: string;
  permission: Permissions;
  control: Control<FormValues, unknown, FormValues>;
  setValue: UseFormSetValue<FormValues>;
  getValues: UseFormGetValues<FormValues>;
  onConfirm?: (newValue: boolean, onChange: (value: boolean) => void) => void;
};

const LabelController: React.FC<LabelControllerProps> = ({
  control,
  permission,
  label,
  onConfirm,
}) => (
  <div className="mb-4 flex items-center justify-between gap-2">
    {label}
    <Controller
      name={permission}
      control={control}
      render={({ field }) => (
        <Switch
          {...field}
          checked={field.value}
          onCheckedChange={(val) => {
            if (val === false && onConfirm) {
              onConfirm(val, field.onChange);
            } else {
              field.onChange(val);
            }
          }}
          value={field.value?.toString()}
          aria-label={label}
        />
      )}
    />
  </div>
);

const AdminSettingsDialog: React.FC<AdminSettingsDialogProps> = ({
  permissionType,
  sectionKey,
  permissions,
  menuId,
  mutation,
  showAdminWarning = true,
  trigger,
  dialogContentClassName,
  onPermissionConfirm,
  confirmPermissions = [],
  extraContent,
}) => {
  const localize = useLocalize();
  const { user, roles } = useAuthContext();
  const { mutate, isLoading } = mutation;

  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<SystemRoles>(SystemRoles.USER);

  const defaultValues = useMemo(() => {
    if (roles?.[selectedRole]?.permissions) {
      return roles[selectedRole]?.permissions[permissionType];
    }
    return roleDefaults[selectedRole].permissions[permissionType];
  }, [roles, selectedRole, permissionType]);

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
    if (roles?.[selectedRole]?.permissions?.[permissionType]) {
      reset(roles[selectedRole]?.permissions[permissionType]);
    } else {
      reset(roleDefaults[selectedRole].permissions[permissionType]);
    }
  }, [roles, selectedRole, reset, permissionType]);

  if (user?.role !== SystemRoles.ADMIN) {
    return null;
  }

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

  const defaultTrigger = (
    <Button
      size="sm"
      variant="outline"
      className="relative h-9 w-full gap-2 rounded-lg border-border-light font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
      aria-label={localize('com_ui_admin_settings')}
    >
      <ShieldEllipsis className="size-5 cursor-pointer" aria-hidden="true" />
      {localize('com_ui_admin_settings')}
    </Button>
  );

  return (
    <>
      <OGDialog>
        <OGDialogTrigger asChild>{trigger ?? defaultTrigger}</OGDialogTrigger>
        <OGDialogContent
          className={
            dialogContentClassName ??
            'w-11/12 max-w-lg border-border-light bg-surface-primary text-text-primary'
          }
        >
          <OGDialogTitle>
            {localize('com_ui_admin_settings_section', { section: localize(sectionKey) })}
          </OGDialogTitle>
          <div className="p-2">
            {/* Role selection dropdown */}
            <div className="flex items-center gap-2">
              <span className="font-medium">{localize('com_ui_role_select')}:</span>
              <DropdownPopup
                unmountOnHide={true}
                menuId={menuId}
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
                {permissions.map(({ permission, labelKey }) => {
                  const label = localize(labelKey);
                  const needsConfirm =
                    selectedRole === SystemRoles.ADMIN &&
                    confirmPermissions.includes(permission) &&
                    onPermissionConfirm;

                  return (
                    <div key={permission}>
                      <LabelController
                        control={control}
                        permission={permission}
                        label={label}
                        getValues={getValues}
                        setValue={setValue}
                        onConfirm={
                          needsConfirm
                            ? (newValue, onChange) =>
                                onPermissionConfirm(permission, newValue, onChange)
                            : undefined
                        }
                      />
                      {showAdminWarning &&
                        selectedRole === SystemRoles.ADMIN &&
                        permission === Permissions.USE && (
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
                        )}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="submit"
                  disabled={isSubmitting || isLoading}
                  aria-label={localize('com_ui_save')}
                >
                  {localize('com_ui_save')}
                </Button>
              </div>
            </form>
          </div>
        </OGDialogContent>
      </OGDialog>
      {extraContent}
    </>
  );
};

export default AdminSettingsDialog;
