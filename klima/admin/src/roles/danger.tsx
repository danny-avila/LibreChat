import { useState } from 'react';

import type { AdminRoleSuccessResponse, AdminRoleDetail } from './types';
import type { ApiClient, ApiError } from '../api';

import { buttonDanger, inputField, ErrorNote, WarningNote } from '../ui';
import { SYSTEM_ROLE_REASON, isSystemRole } from './system';
import { rolePath } from './paths';

interface DeleteRoleFormProps {
  client: ApiClient;
  role: AdminRoleDetail;
  memberTotal: number | null;
  onDeleted: (message: string) => void;
}

/** What each refusal from `DELETE /api/admin/roles/:name` means to the admin reading it. */
const REFUSALS: Record<number, string> = {
  403: 'The API answers 403 for ADMIN and USER: system roles cannot be deleted.',
  404: 'That role is already gone. Reload the list.',
};

/**
 * `deleteRoleHandler` cascades the role's config override, its ACL entries and its system
 * capability grants (auditing each removed grant through `emitGrantRemovals`), but it does
 * not touch the `role` field of its members.
 */
const CASCADE_WARNING =
  'Deleting cascades: the role’s config override, its ACL entries on shared agents, prompts and files, and every system capability grant it holds are removed with it, and each removed grant is written to the audit log.';

const MEMBER_WARNING =
  'Members are not reassigned. The delete route removes the role document only, so everyone still holding it keeps a role name that no longer resolves to a role — move them to another role first.';

export const DeleteRoleForm = ({ client, role, memberTotal, onDeleted }: DeleteRoleFormProps) => {
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const system = isSystemRole(role.name);
  const matches = confirmation.trim() === role.name;
  const canDelete = matches && !system && !submitting;

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);

    const result = await client.remove<AdminRoleSuccessResponse>(rolePath(role.name));
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setConfirmation('');
    onDeleted(`Deleted the role ${role.name}.`);
  };

  return (
    <section className="rounded-lg border border-red-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-red-800">Delete this role</h3>
      <div className="mt-3 space-y-2">
        <WarningNote>{CASCADE_WARNING}</WarningNote>
        <WarningNote>
          {MEMBER_WARNING}
          {memberTotal === null ? '' : ` It currently has ${memberTotal} member(s).`}
        </WarningNote>
      </div>

      <form
        className="mt-3 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (canDelete) {
            void submit();
          }
        }}
      >
        <label className="block text-sm font-medium text-slate-700" htmlFor="role-delete-confirm">
          Type <span className="font-mono">{role.name}</span> to confirm
        </label>
        <input
          id="role-delete-confirm"
          className={inputField}
          type="text"
          value={confirmation}
          autoComplete="off"
          disabled={system || submitting}
          aria-describedby="role-delete-help"
          onChange={(event) => setConfirmation(event.target.value)}
        />
        <p id="role-delete-help" className="text-xs text-slate-500">
          {system
            ? SYSTEM_ROLE_REASON
            : 'The delete button stays disabled until this matches exactly.'}
        </p>
        <button type="submit" className={buttonDanger} disabled={!canDelete}>
          {submitting ? 'Deleting…' : 'Delete role permanently'}
        </button>
      </form>

      {error ? (
        <div className="mt-3 space-y-2">
          <ErrorNote error={error} label="The deletion was refused." />
          {REFUSALS[error.status] ? (
            <p className="text-sm text-slate-700">{REFUSALS[error.status]}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
