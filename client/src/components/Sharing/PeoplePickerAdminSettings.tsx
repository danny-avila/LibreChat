import { useEffect, useId, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { useForm, Controller } from 'react-hook-form';
import { ChevronDown, ShieldEllipsis } from 'lucide-react';
import { Permissions, SystemRoles, PermissionTypes } from 'librechat-data-provider';
import {
  Label,
  Button,
  Switch,
  OGDialog,
  DropdownPopup,
  OGDialogHeader,
  OGDialogFooter,
  OGDialogTitle,
  OGDialogDescription,
  OGDialogContent,
  OGDialogTrigger,
  useToastContext,
} from '@librechat/client';
import type { Control } from 'react-hook-form';
import { useUpdatePeoplePickerPermissionsMutation } from '~/data-provider';
import { useLocalize, useAuthContext, useRoleSelector } from '~/hooks';

type FormValues = {
  [Permissions.VIEW_USERS]: boolean;
  [Permissions.VIEW_GROUPS]: boolean;
  [Permissions.VIEW_ROLES]: boolean;
};

type LabelControllerProps = {
  label: string;
  peoplePickerPerm: Permissions.VIEW_USERS | Permissions.VIEW_GROUPS | Permissions.VIEW_ROLES;
  control: Control<FormValues, unknown, FormValues>;
};

const LabelController: React.FC<LabelControllerProps> = ({ control, peoplePickerPerm, label }) => (
  <div className="flex items-center justify-between gap-4 px-4 py-3.5">
    <Label
      htmlFor={peoplePickerPerm}
      className="w-auto cursor-pointer select-none break-normal text-sm font-medium text-text-primary"
    >
      {label}
    </Label>
    <Controller
      name={peoplePickerPerm}
      control={control}
      render={({ field }) => (
        <Switch
          {...field}
          id={peoplePickerPerm}
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
  const { user } = useAuthContext();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);
  const roleLabelId = useId();
  const roleValueId = useId();
  const {
    selectedRole,
    isSelectedCustomRole,
    isCustomRoleLoading,
    isCustomRoleError,
    defaultValues,
    roleDropdownItems,
  } = useRoleSelector(PermissionTypes.PEOPLE_PICKER);

  const {
    reset,
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    mode: 'onChange',
    defaultValues: defaultValues as FormValues,
  });

  useEffect(() => {
    if (isSelectedCustomRole && (isCustomRoleLoading || isCustomRoleError)) {
      return;
    }
    reset(defaultValues as FormValues);
  }, [isSelectedCustomRole, isCustomRoleLoading, isCustomRoleError, defaultValues, reset]);

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      setIsRoleMenuOpen(false);
      reset(defaultValues as FormValues);
    }
    setIsDialogOpen(open);
  };

  const { mutate, isLoading } = useUpdatePeoplePickerPermissionsMutation({
    onSuccess: () => {
      showToast({ status: 'success', message: localize('com_ui_saved') });
      handleDialogOpenChange(false);
    },
    onError: () => {
      showToast({ status: 'error', message: localize('com_ui_error_save_admin_settings') });
    },
  });

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

  return (
    <OGDialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
      <OGDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="gap-2 rounded-lg font-medium"
          aria-label={localize('com_ui_admin_settings')}
        >
          <ShieldEllipsis className="size-4" aria-hidden="true" />
          {localize('com_ui_admin_settings')}
        </Button>
      </OGDialogTrigger>
      <OGDialogContent className="w-11/12 max-w-2xl gap-0 overflow-hidden p-0">
        <OGDialogHeader className="px-5 py-5 pr-14 text-left sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-light bg-surface-secondary text-text-secondary">
              <ShieldEllipsis className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1">
              <OGDialogTitle className="text-xl leading-7">
                {localize('com_ui_admin_settings_section', {
                  section: localize('com_ui_people_picker'),
                })}
              </OGDialogTitle>
              <OGDialogDescription className="sr-only">
                {localize('com_ui_people_picker_admin_description')}
              </OGDialogDescription>
            </div>
          </div>
        </OGDialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4 p-4 sm:p-6">
            <div className="grid gap-3 rounded-xl border border-border-light bg-surface-secondary p-4 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center">
              <span id={roleLabelId} className="text-sm font-semibold text-text-primary">
                {localize('com_ui_role_select')}
              </span>
              <DropdownPopup
                unmountOnHide={true}
                menuId="people-picker-role-dropdown"
                isOpen={isRoleMenuOpen}
                setIsOpen={setIsRoleMenuOpen}
                trigger={
                  <Ariakit.MenuButton
                    aria-labelledby={`${roleLabelId} ${roleValueId}`}
                    className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border-medium bg-transparent px-3 text-sm text-text-primary transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
                  >
                    <span id={roleValueId} className="truncate font-medium">
                      {selectedRole}
                    </span>
                    <ChevronDown
                      className="size-4 shrink-0 text-text-secondary"
                      aria-hidden="true"
                    />
                  </Ariakit.MenuButton>
                }
                items={roleDropdownItems}
                itemClassName="items-center justify-center"
                sameWidth={true}
              />
            </div>

            <div className="divide-y divide-border-light overflow-hidden rounded-xl border border-border-light bg-surface-secondary">
              {labelControllerData.map(({ peoplePickerPerm, label }) => (
                <LabelController
                  key={peoplePickerPerm}
                  control={control}
                  peoplePickerPerm={peoplePickerPerm}
                  label={label}
                />
              ))}
            </div>
          </div>

          <OGDialogFooter className="bg-transparent px-4 py-4 sm:px-6">
            <Button
              variant="submit"
              type="submit"
              disabled={
                isSubmitting ||
                isLoading ||
                (isSelectedCustomRole && (isCustomRoleLoading || isCustomRoleError))
              }
              className="font-bold"
            >
              {localize('com_ui_save')}
            </Button>
          </OGDialogFooter>
        </form>
      </OGDialogContent>
    </OGDialog>
  );
};

export default PeoplePickerAdminSettings;
