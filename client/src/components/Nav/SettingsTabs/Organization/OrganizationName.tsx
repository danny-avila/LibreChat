import { useState } from 'react';
import {
  Input,
  Label,
  Button,
  OGDialog,
  OGDialogTrigger,
  useToastContext,
  OGDialogTemplate,
} from '@librechat/client';
import { useCurrentOrganizationQuery, useRenameOrganizationMutation } from '~/data-provider';
import { useLocalize, useOrganizationErrorMessage } from '~/hooks';
import { useSettingsContext } from '../../Settings/context';

/** The current organization's name, renamable by its admins, and the member's own role. */
export default function OrganizationName() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { isOrganizationAdmin } = useSettingsContext();
  const getOrganizationError = useOrganizationErrorMessage();
  const { data } = useCurrentOrganizationQuery();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const rename = useRenameOrganizationMutation({
    onSuccess: () => {
      setOpen(false);
      showToast({ message: localize('com_ui_org_renamed'), status: 'success' });
    },
    onError: (error) => showToast({ message: getOrganizationError(error), status: 'error' }),
  });

  const trimmed = name.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 80;

  return (
    <OGDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName(data?.organization.name ?? '');
        }
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <Label className="font-light">{localize('com_ui_org_name')}</Label>
          <span className="text-text-primary truncate text-sm" data-testid="organization-name">
            {data?.organization.name ?? ''}
          </span>
          {data?.role && (
            <span className="text-text-secondary text-xs">
              {localize('com_ui_org_your_role', { 0: data.role })}
            </span>
          )}
        </div>
        {isOrganizationAdmin && (
          <OGDialogTrigger asChild>
            <Button variant="outline" aria-label={localize('com_ui_rename')}>
              {localize('com_ui_rename')}
            </Button>
          </OGDialogTrigger>
        )}
      </div>
      <OGDialogTemplate
        title={localize('com_ui_rename')}
        className="w-11/12 max-w-md"
        main={
          <div className="flex flex-col gap-2">
            <Label htmlFor="organization-rename">{localize('com_ui_org_name')}</Label>
            <Input
              id="organization-rename"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        }
        selection={{
          selectHandler: () => valid && rename.mutate(trimmed),
          selectText: localize('com_ui_save'),
          isLoading: rename.isLoading,
        }}
      />
    </OGDialog>
  );
}
