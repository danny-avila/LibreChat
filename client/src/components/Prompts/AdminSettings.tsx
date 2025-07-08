import * as Ariakit from '@ariakit/react';
import { ExternalLink } from 'lucide-react';
import { useMemo, useEffect, useState } from 'react';
import { ShieldEllipsis } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { Permissions, SystemRoles, roleDefaults, PermissionTypes } from 'librechat-data-provider';
import type { Control, UseFormSetValue, UseFormGetValues } from 'react-hook-form';
import {
  OGDialog,
  OGDialogTitle,
  OGDialogContent,
  OGDialogTrigger,
  Button,
  Switch,
  DropdownPopup,
} from '~/components/ui';
import { useUpdatePromptPermissionsMutation } from '~/data-provider';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useLocalize, useAuthContext } from '~/hooks';
import { useToastContext } from '~/Providers';

type FormValues = Record<Permissions, boolean>;

type LabelControllerProps = {
  label: string;
  promptPerm: Permissions;
  control: Control<FormValues, unknown, FormValues>;
  setValue: UseFormSetValue<FormValues>;
  getValues: UseFormGetValues<FormValues>;
  confirmChange?: (newValue: boolean, onChange: (value: boolean) => void) => void;
};

const LabelController: React.FC<LabelControllerProps> = ({
  control,
  promptPerm,
  label,
  confirmChange,
}) => (
  <div className="mb-4 flex items-center justify-between gap-2">
    {label}
    <Controller
      name={promptPerm}
      control={control}
      render={({ field }) => (
        <Switch
          {...field}
          checked={field.value}
          onCheckedChange={(val) => {
            if (val === false && confirmChange) {
              confirmChange(val, field.onChange);
            } else {
              field.onChange(val);
            }
          }}
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
  const [confirmAdminUseChange, setConfirmAdminUseChange] = useState<{
    newValue: boolean;
    callback: (value: boolean) => void;
  } | null>(null);
  const { mutate, isLoading } = useUpdatePromptPermissionsMutation({
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
    if (roles?.[selectedRole]?.permissions) {
      return roles[selectedRole]?.permissions[PermissionTypes.PROMPTS];
    }
    return roleDefaults[selectedRole].permissions[PermissionTypes.PROMPTS];
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
    reset(roles?.[selectedRole]?.permissions?.[PermissionTypes.PROMPTS]);
  }, [roles, selectedRole, reset]);

  if (user?.role !== SystemRoles.ADMIN) {
    return null;
  }

  const labelControllerData = [
    {
      promptPerm: Permissions.SHARED_GLOBAL,
      label: localize('com_ui_prompts_allow_share_global'),
    },
    {
      promptPerm: Permissions.CREATE,
      label: localize('com_ui_prompts_allow_create'),
    },
    {
      promptPerm: Permissions.USE,
      label: localize('com_ui_prompts_allow_use'),
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
    <>
      <OGDialog>
        <OGDialogTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="mr-2 h-10 w-fit gap-1 border transition-all dark:bg-transparent dark:hover:bg-surface-tertiary sm:m-0"
          >
            <ShieldEllipsis className="cursor-pointer" aria-hidden="true" />
            <span className="hidden sm:flex">{localize('com_ui_admin')}</span>
          </Button>
        </OGDialogTrigger>
        <OGDialogContent className="w-11/12 max-w-lg border-border-light bg-surface-primary text-text-primary">
          <OGDialogTitle>
            {`${localize('com_ui_admin_settings')} - ${localize('com_ui_prompts')}`}
          </OGDialogTitle>
          <div className="p-2">
            {/* Role selection dropdown */}
            <div className="flex items-center gap-2">
              <span className="font-medium">{localize('com_ui_role_select')}:</span>
              <DropdownPopup
                unmountOnHide={true}
                menuId="prompt-role-dropdown"
                isOpen={isRoleMenuOpen}
                setIsOpen={setIsRoleMenuOpen}
                trigger={
                  <Ariakit.MenuButton className="inline-flex w-1/5 items-center justify-center rounded-lg border border-border-light bg-transparent px-2 py-1 text-text-primary transition-all ease-in-out hover:bg-surface-tertiary">
                    {selectedRole}
                  </Ariakit.MenuButton>
                }
                items={roleDropdownItems}
                itemClassName="items-center justify-center"
                sameWidth={true}
              />
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="py-5">
                {labelControllerData.map(({ promptPerm, label }) => (
                  <div key={promptPerm}>
                    <LabelController
                      control={control}
                      promptPerm={promptPerm}
                      label={label}
                      getValues={getValues}
                      setValue={setValue}
                      {...(selectedRole === SystemRoles.ADMIN && promptPerm === Permissions.USE
                        ? {
                            confirmChange: (
                              newValue: boolean,
                              onChange: (value: boolean) => void,
                            ) => setConfirmAdminUseChange({ newValue, callback: onChange }),
                          }
                        : {})}
                    />
                    {selectedRole === SystemRoles.ADMIN && promptPerm === Permissions.USE && (
                      <>
                        <div className="mb-2 max-w-full whitespace-normal break-words text-sm text-red-600">
                          <span>{localize('com_ui_admin_access_warning')}</span>
                          {'\n'}
                          <a
                            href="https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/interface"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center text-blue-500 underline"
                          >
                            {localize('com_ui_more_info')}
                            <ExternalLink size={16} className="ml-1" />
                          </a>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting || isLoading} variant="submit">
                  {localize('com_ui_save')}
                </Button>
              </div>
            </form>
          </div>
        </OGDialogContent>
      </OGDialog>

      <OGDialog
        open={confirmAdminUseChange !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAdminUseChange(null);
          }
        }}
      >
        <OGDialogTemplate
          showCloseButton={true}
          title={localize('com_ui_confirm_change')}
          className="w-11/12 max-w-lg"
          main={<p className="mb-4">{localize('com_ui_confirm_admin_use_change')}</p>}
          selection={{
            selectHandler: () => {
              if (confirmAdminUseChange) {
                confirmAdminUseChange.callback(confirmAdminUseChange.newValue);
              }
              setConfirmAdminUseChange(null);
            },
            selectClasses:
              'bg-surface-destructive hover:bg-surface-destructive-hover text-white transition-colors duration-200',
            selectText: localize('com_ui_confirm_action'),
            isLoading: false,
          }}
        />
      </OGDialog>
    </>
  );
};

export default AdminSettings;
