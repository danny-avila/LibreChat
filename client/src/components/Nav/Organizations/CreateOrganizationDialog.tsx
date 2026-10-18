import { useState } from 'react';
import { Input, Label, OGDialog, OGDialogTemplate, useToastContext } from '@librechat/client';
import type { RefObject } from 'react';
import { useLocalize, useOrganizationErrorMessage } from '~/hooks';
import { useCreateOrganizationMutation } from '~/data-provider';
import { enterOrganizationSession } from '~/utils';

/** Names a new organization; the signed-in account becomes its admin and moves into it. */
export default function CreateOrganizationDialog({
  open,
  onOpenChange,
  triggerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const getOrganizationError = useOrganizationErrorMessage();
  const [name, setName] = useState('');
  const create = useCreateOrganizationMutation(undefined, {
    onSuccess: (session) => enterOrganizationSession(session.organization.id),
    onError: (error) => showToast({ message: getOrganizationError(error), status: 'error' }),
  });
  const trimmed = name.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 80;

  return (
    <OGDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setName('');
        }
      }}
      triggerRef={triggerRef}
    >
      <OGDialogTemplate
        title={localize('com_ui_org_create_title')}
        description={localize('com_ui_org_create_description')}
        className="w-11/12 max-w-md"
        main={
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) {
                create.mutate({ name: trimmed });
              }
            }}
          >
            <Label htmlFor="create-organization-name">{localize('com_auth_org_name')}</Label>
            <Input
              id="create-organization-name"
              value={name}
              maxLength={80}
              autoComplete="organization"
              onChange={(event) => setName(event.target.value)}
            />
          </form>
        }
        selection={{
          selectHandler: () => valid && create.mutate({ name: trimmed }),
          selectText: localize('com_ui_create'),
          isLoading: create.isLoading,
        }}
      />
    </OGDialog>
  );
}
