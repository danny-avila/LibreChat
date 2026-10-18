import { useState } from 'react';
import { dataService, OrganizationLifecycle } from 'librechat-data-provider';
import type { TAdminOrganizationDetail } from 'librechat-data-provider';
import {
  organizationQueryOptions,
  renameOrganizationFn,
  suspendOrganizationFn,
  deleteOrganizationFn,
  reactivateOrganizationFn,
} from '~/admin/api';
import { useQuery, useMutation, useQueryClient } from '~/admin/query';
import { FormDialog, LoadingState } from '~/admin/components/shared';
import { OrganizationStatusBadge } from './OrganizationStatusBadge';
import { useSwitchAdminScope } from '~/admin/hooks/useAdminScope';
import { Alert, Button, Dialog, TextField } from '~/admin/ui';
import { notifySuccess, notifyError } from '~/admin/utils';
import { ConfirmDialog } from '~/admin/components/access';
import { adminErrorMessage } from '~/admin/utils/errors';
import { enterOrganizationSession } from '~/utils';
import { useLocalize } from '~/admin/hooks';

type Pending = 'rename' | 'suspend' | 'reactivate' | 'delete' | null;

/**
 * One organization, for the operator: who administers it, how many people it has, and what can
 * be done to it. Deleting asks for the organization's name, because it cannot be undone.
 */
export function OrganizationDetailDialog({
  organizationId,
  onClose,
}: {
  organizationId: string | null;
  onClose: () => void;
}) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const switchScope = useSwitchAdminScope();
  const [pending, setPending] = useState<Pending>(null);
  const [name, setName] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [entering, setEntering] = useState(false);
  const query = useQuery(organizationQueryOptions(organizationId ?? undefined));
  const organization: TAdminOrganizationDetail | undefined = query.data?.organization;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['adminOrganizations'] });
    queryClient.invalidateQueries({ queryKey: ['adminOrganization', organizationId] });
  };
  const failed = (error: Error) => notifyError(adminErrorMessage(error, localize));
  const closeAction = () => {
    setPending(null);
    setName('');
    setConfirmName('');
  };

  const rename = useMutation({
    mutationFn: (next: string) =>
      renameOrganizationFn({ data: { id: organizationId ?? '', name: next } }),
    onSuccess: () => {
      refresh();
      notifySuccess(localize('com_admin_orgs_renamed'));
      closeAction();
    },
    onError: failed,
  });
  const suspend = useMutation({
    mutationFn: () => suspendOrganizationFn({ data: { id: organizationId ?? '' } }),
    onSuccess: () => {
      refresh();
      notifySuccess(localize('com_admin_orgs_suspended', { name: organization?.name ?? '' }));
      closeAction();
    },
    onError: failed,
  });
  const reactivate = useMutation({
    mutationFn: () => reactivateOrganizationFn({ data: { id: organizationId ?? '' } }),
    onSuccess: () => {
      refresh();
      notifySuccess(localize('com_admin_orgs_reactivated', { name: organization?.name ?? '' }));
      closeAction();
    },
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: (typed: string) =>
      deleteOrganizationFn({ data: { id: organizationId ?? '', confirmName: typed } }),
    onSuccess: () => {
      refresh();
      notifySuccess(
        localize('com_admin_orgs_deletion_started', { name: organization?.name ?? '' }),
      );
      closeAction();
      onClose();
    },
    onError: failed,
  });

  /** Enters the organization in SassyChat itself, as a full admin its members do not see. */
  const enter = async () => {
    if (!organizationId) return;
    setEntering(true);
    try {
      const session = await dataService.switchOrganization(organizationId);
      enterOrganizationSession(session.organization.id);
    } catch {
      setEntering(false);
      notifyError(localize('com_admin_orgs_enter_failed'));
    }
  };

  const deleting = organization?.status === OrganizationLifecycle.DELETING;
  const suspended = organization?.status === OrganizationLifecycle.SUSPENDED;

  const renderBody = () => {
    if (query.isPending) {
      return <LoadingState />;
    }
    if (query.isError || !organization) {
      return <Alert state="danger" text={adminErrorMessage(query.error, localize)} />;
    }
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <OrganizationStatusBadge status={organization.status} />
          <span className="text-sm text-(--cui-color-text-muted)">
            {localize('com_admin_orgs_counts', {
              members: organization.memberCount,
              invites: organization.pendingInviteCount,
            })}
          </span>
        </div>

        {deleting && <Alert state="warning" text={localize('com_admin_orgs_deleting_note')} />}
        {suspended && <Alert state="warning" text={localize('com_admin_orgs_suspended_note')} />}

        <section aria-labelledby="org-admins-heading" className="flex flex-col gap-2">
          <h3
            id="org-admins-heading"
            className="text-sm font-semibold text-(--cui-color-text-default)"
          >
            {localize('com_admin_orgs_admins')}
          </h3>
          {organization.admins.length === 0 ? (
            <p className="text-sm text-(--cui-color-text-muted)">
              {localize('com_admin_orgs_no_admins')}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {organization.admins.map((admin) => (
                <li key={admin.id} className="text-sm">
                  <span className="text-(--cui-color-text-default)">
                    {admin.name ?? admin.email}
                  </span>
                  {admin.name && admin.email && (
                    <span className="ml-2 text-(--cui-color-text-muted)">{admin.email}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-wrap gap-2">
          <Button
            type="primary"
            iconLeft="settings"
            label={localize('com_admin_orgs_manage')}
            disabled={deleting}
            onClick={() => {
              onClose();
              switchScope(organization.id);
            }}
          />
          <Button
            type="secondary"
            iconLeft="chat"
            label={localize('com_admin_orgs_enter')}
            loading={entering}
            disabled={deleting || entering}
            onClick={enter}
          />
          <Button
            type="secondary"
            iconLeft="pencil"
            label={localize('com_admin_orgs_rename')}
            disabled={deleting}
            onClick={() => {
              setName(organization.name);
              setPending('rename');
            }}
          />
          {suspended ? (
            <Button
              type="secondary"
              label={localize('com_admin_orgs_reactivate')}
              disabled={deleting}
              onClick={() => setPending('reactivate')}
            />
          ) : (
            <Button
              type="secondary"
              label={localize('com_admin_orgs_suspend')}
              disabled={deleting}
              onClick={() => setPending('suspend')}
            />
          )}
          <Button
            type="danger"
            iconLeft="trash"
            label={localize('com_admin_orgs_delete')}
            disabled={deleting}
            onClick={() => setPending('delete')}
          />
        </div>
      </div>
    );
  };

  const trimmed = name.trim();
  return (
    <>
      <Dialog
        open={organizationId != null && pending == null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <Dialog.Content
          title={organization?.name ?? localize('com_admin_orgs_detail_title')}
          showClose
          onClose={onClose}
          className="max-w-lg!"
        >
          {renderBody()}
        </Dialog.Content>
      </Dialog>

      <FormDialog
        open={pending === 'rename'}
        title={localize('com_admin_orgs_rename_title')}
        submitLabel={localize('com_admin_ui_save')}
        submitDisabled={trimmed.length < 2 || trimmed.length > 80 || trimmed === organization?.name}
        saving={rename.isPending}
        onSubmit={() => rename.mutate(trimmed)}
        onClose={closeAction}
      >
        <TextField
          label={localize('com_admin_orgs_col_name')}
          value={name}
          maxLength={80}
          onChange={(value) => setName(value)}
        />
      </FormDialog>

      <ConfirmDialog
        open={pending === 'suspend'}
        title={localize('com_admin_orgs_suspend_title', { name: organization?.name ?? '' })}
        description={localize('com_admin_orgs_suspend_desc')}
        confirmLabel={localize('com_admin_orgs_suspend')}
        confirmType="danger"
        saving={suspend.isPending}
        onConfirm={() => suspend.mutate()}
        onCancel={closeAction}
      />

      <ConfirmDialog
        open={pending === 'reactivate'}
        title={localize('com_admin_orgs_reactivate_title', { name: organization?.name ?? '' })}
        description={localize('com_admin_orgs_reactivate_desc')}
        confirmLabel={localize('com_admin_orgs_reactivate')}
        confirmType="primary"
        saving={reactivate.isPending}
        onConfirm={() => reactivate.mutate()}
        onCancel={closeAction}
      />

      <FormDialog
        open={pending === 'delete'}
        title={localize('com_admin_orgs_delete_title', { name: organization?.name ?? '' })}
        submitLabel={localize('com_admin_orgs_delete')}
        submitDisabled={confirmName.trim() !== organization?.name}
        saving={remove.isPending}
        hint={localize('com_admin_orgs_delete_hint')}
        onSubmit={() => remove.mutate(confirmName.trim())}
        onClose={closeAction}
      >
        <div className="flex flex-col gap-3">
          <Alert state="danger" text={localize('com_admin_orgs_delete_desc')} />
          <TextField
            label={localize('com_admin_orgs_delete_confirm', { name: organization?.name ?? '' })}
            value={confirmName}
            autoComplete="off"
            onChange={(value) => setConfirmName(value)}
          />
        </div>
      </FormDialog>
    </>
  );
}
